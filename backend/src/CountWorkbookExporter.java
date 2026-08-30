package br.com.mncheck;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.apache.poi.openxml4j.exceptions.OLE2NotOfficeXmlFileException;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

final class CountWorkbookExporter {
  static final String CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  private static final int MAX_TEMPLATE_BYTES = 15 * 1024 * 1024;
  private static final int FIRST_DATA_ROW = 1;
  private static final int CODE = 0;
  private static final int COLOR = 1;
  private static final int VOLTAGE = 2;
  private static final int DESCRIPTION = 3;
  private static final int COUNTED = 8;
  private static final int ASSISTANCE = 10;
  private static final int DAMAGED = 11;
  private static final int OTHER = 12;
  private static final int TOTAL = 14;
  private static final int SYSTEM = 15;
  private static final int DIFFERENCE = 16;
  private static final int OBSERVATION = 17;
  private static final Map<Integer, String> REQUIRED_HEADERS = Map.ofEntries(
      Map.entry(CODE, "codigo"),
      Map.entry(COLOR, "cor"),
      Map.entry(VOLTAGE, "voltagem"),
      Map.entry(DESCRIPTION, "produto"),
      Map.entry(COUNTED, "contagem"),
      Map.entry(ASSISTANCE, "assist"),
      Map.entry(DAMAGED, "avaria"),
      Map.entry(OTHER, "ent nf"),
      Map.entry(TOTAL, "c total"),
      Map.entry(SYSTEM, "saldo"),
      Map.entry(DIFFERENCE, "diferenca"),
      Map.entry(OBSERVATION, "obs")
  );

  private CountWorkbookExporter() {}

  static TemplateInfo validate(byte[] template) {
    if (template == null || template.length == 0) {
      throw new IllegalArgumentException("Selecione a planilha modelo em formato XLSX.");
    }
    if (template.length > MAX_TEMPLATE_BYTES) {
      throw new IllegalArgumentException("A planilha modelo deve ter no máximo 15 MB.");
    }
    try (XSSFWorkbook workbook = open(template)) {
      if (workbook.getNumberOfSheets() != 1) {
        throw new IllegalArgumentException("A planilha modelo deve possuir exatamente uma aba.");
      }
      XSSFSheet sheet = workbook.getSheetAt(0);
      Row header = sheet.getRow(0);
      if (header == null) throw new IllegalArgumentException("A planilha modelo não possui cabeçalho.");
      for (Map.Entry<Integer, String> required : REQUIRED_HEADERS.entrySet()) {
        String actual = normalize(cellText(header.getCell(required.getKey())));
        if (!actual.startsWith(required.getValue())) {
          throw new IllegalArgumentException("Cabeçalho incompatível na coluna "
              + columnName(required.getKey()) + ": esperado " + required.getValue() + ".");
        }
      }
      int products = indexRows(sheet).size();
      if (products == 0) throw new IllegalArgumentException("A planilha modelo não contém produtos válidos.");
      return new TemplateInfo(sheet.getSheetName(), products, template.length);
    } catch (OLE2NotOfficeXmlFileException error) {
      throw new IllegalArgumentException("O modelo deve ser um arquivo XLSX verdadeiro, não XLS antigo.", error);
    } catch (IllegalArgumentException error) {
      throw error;
    } catch (Exception error) {
      throw new IllegalArgumentException("Não foi possível validar a planilha modelo: " + error.getMessage(), error);
    }
  }

  static byte[] export(byte[] template, List<MmCheckServer.CountItem> items) throws IOException {
    validate(template);
    try (XSSFWorkbook workbook = open(template); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      XSSFSheet sheet = workbook.getSheetAt(0);
      Map<String, Row> rowsBySku = indexRows(sheet);
      Row styleSource = rowsBySku.values().stream().findFirst()
          .orElseThrow(() -> new IllegalArgumentException("A planilha modelo não possui uma linha de produto."));

      // Apenas os campos de propriedade do MN-Check são zerados; as colunas manuais ficam intactas.
      for (Row row : rowsBySku.values()) {
        setNumber(row, COUNTED, 0, false);
        setNumber(row, ASSISTANCE, 0, true);
        setNumber(row, DAMAGED, 0, true);
        setNumber(row, OTHER, 0, true);
        setNumber(row, SYSTEM, 0, false);
        setFormulas(row);
      }

      int nextRow = lastProductRow(sheet) + 1;
      for (MmCheckServer.CountItem item : items) {
        Row row = rowsBySku.get(normalizeSku(item.sku()));
        if (row == null) {
          row = sheet.createRow(nextRow++);
          copyRowPresentation(styleSource, row);
          writeSku(row, item.sku());
          clearManualFields(row);
          rowsBySku.put(normalizeSku(item.sku()), row);
        }
        setTextPreservingStyle(row, DESCRIPTION, item.description());
        setNumber(row, COUNTED, item.counted(), false);
        setNumber(row, ASSISTANCE, item.assistance(), true);
        setNumber(row, DAMAGED, item.damaged(), true);
        setNumber(row, OTHER, item.other(), true);
        setNumber(row, SYSTEM, item.system(), false);
        setFormulas(row);
      }

      if (sheet.getCTWorksheet().isSetAutoFilter()) {
        sheet.setAutoFilter(new CellRangeAddress(0, Math.max(lastProductRow(sheet), FIRST_DATA_ROW), 0, OBSERVATION));
      }
      workbook.getCreationHelper().createFormulaEvaluator().evaluateAll();
      workbook.setForceFormulaRecalculation(true);
      workbook.write(output);
      return output.toByteArray();
    }
  }

  private static XSSFWorkbook open(byte[] bytes) throws IOException {
    return new XSSFWorkbook(new ByteArrayInputStream(bytes));
  }

  private static Map<String, Row> indexRows(Sheet sheet) {
    Map<String, Row> rows = new LinkedHashMap<>();
    for (int rowIndex = FIRST_DATA_ROW; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
      Row row = sheet.getRow(rowIndex);
      String sku = skuOf(row);
      if (!sku.isBlank()) rows.putIfAbsent(sku, row);
    }
    return rows;
  }

  private static int lastProductRow(Sheet sheet) {
    int last = FIRST_DATA_ROW;
    for (int index = FIRST_DATA_ROW; index <= sheet.getLastRowNum(); index++) {
      if (!skuOf(sheet.getRow(index)).isBlank()) last = index;
    }
    return last;
  }

  private static String skuOf(Row row) {
    if (row == null) return "";
    String code = identifier(row.getCell(CODE));
    String color = identifier(row.getCell(COLOR));
    String voltage = identifier(row.getCell(VOLTAGE));
    if (code.isBlank() || color.isBlank() || voltage.isBlank()) return "";
    return normalizeSku(code + "." + color + "." + voltage);
  }

  private static void writeSku(Row row, String sku) {
    String[] parts = sku.split("\\.", -1);
    writeIdentifier(row, CODE, parts, 0);
    writeIdentifier(row, COLOR, parts, 1);
    writeIdentifier(row, VOLTAGE, parts, 2);
  }

  private static void writeIdentifier(Row row, int column, String[] parts, int part) {
    Cell cell = cell(row, column);
    String value = part < parts.length ? parts[part] : "";
    try {
      cell.setCellValue(Long.parseLong(value));
    } catch (NumberFormatException ignored) {
      cell.setCellValue(value);
    }
  }

  private static void clearManualFields(Row row) {
    for (int column : new int[]{4, 5, 6, 7, 9, 13, 17}) cell(row, column).setBlank();
  }

  private static void setFormulas(Row row) {
    int excelRow = row.getRowNum() + 1;
    cell(row, TOTAL).setCellFormula("SUM(E" + excelRow + ":N" + excelRow + ")");
    cell(row, DIFFERENCE).setCellFormula("O" + excelRow + "-P" + excelRow);
  }

  private static void setNumber(Row row, int column, int value, boolean blankWhenZero) {
    Cell cell = cell(row, column);
    if (blankWhenZero && value == 0) cell.setBlank();
    else cell.setCellValue(value);
  }

  private static void setTextPreservingStyle(Row row, int column, String value) {
    cell(row, column).setCellValue(value == null ? "" : value);
  }

  private static Cell cell(Row row, int column) {
    Cell cell = row.getCell(column);
    return cell == null ? row.createCell(column) : cell;
  }

  private static void copyRowPresentation(Row source, Row target) {
    target.setHeight(source.getHeight());
    for (int column = 0; column <= OBSERVATION; column++) {
      Cell sourceCell = source.getCell(column);
      Cell targetCell = target.createCell(column);
      if (sourceCell != null) {
        CellStyle style = sourceCell.getCellStyle();
        targetCell.setCellStyle(style);
      }
    }
  }

  private static String identifier(Cell cell) {
    if (cell == null || cell.getCellType() == CellType.BLANK) return "";
    if (cell.getCellType() == CellType.NUMERIC) {
      double number = cell.getNumericCellValue();
      long integer = (long) number;
      return number == integer ? Long.toString(integer) : Double.toString(number);
    }
    return cellText(cell).trim().replaceAll("\\.0$", "");
  }

  private static String cellText(Cell cell) {
    if (cell == null) return "";
    return switch (cell.getCellType()) {
      case STRING -> cell.getStringCellValue();
      case NUMERIC -> Double.toString(cell.getNumericCellValue());
      case BOOLEAN -> Boolean.toString(cell.getBooleanCellValue());
      case FORMULA -> cell.getCellFormula();
      default -> "";
    };
  }

  private static String normalizeSku(String value) {
    String[] parts = value.trim().split("\\.", -1);
    if (parts.length != 3) return value.trim().toLowerCase(Locale.ROOT);
    return stripZeros(parts[0]) + "." + stripZeros(parts[1]) + "." + stripZeros(parts[2]);
  }

  private static String stripZeros(String value) {
    try {
      return Long.toString(Long.parseLong(value));
    } catch (NumberFormatException ignored) {
      return value.trim().toLowerCase(Locale.ROOT);
    }
  }

  private static String normalize(String value) {
    return java.text.Normalizer.normalize(value == null ? "" : value, java.text.Normalizer.Form.NFD)
        .replaceAll("\\p{M}", "")
        .replaceAll("[^a-zA-Z0-9]+", " ")
        .trim()
        .toLowerCase(Locale.ROOT);
  }

  private static String columnName(int column) {
    return Character.toString((char) ('A' + column));
  }

  record TemplateInfo(String sheetName, int products, int bytes) {}
}
