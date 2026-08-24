package br.com.mncheck;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFConditionalFormattingRule;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFPatternFormatting;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

final class CountWorkbookExporter {
  private static final String[] HEADERS = {
      "Código", "Cor", "Voltagem", "Produto", "Movimentação", "Trans.", "Licitação", "Clientes",
      "Contagem", "Aud.", "Assist.", "Avaria", "Ent NF.", "Falta", "C. Total", "Saldo", "Diferença", "OBS."
  };
  private static final String[] LEGEND = {
      "Contagem = Saldo", "Contagem > Saldo", "Contagem < Saldo", "Inversão", "Outro"
  };
  private static final byte[] GREEN = rgb("34A853");
  private static final byte[] YELLOW = rgb("FBBC04");
  private static final byte[] RED = rgb("EA4335");
  private static final byte[] CYAN = rgb("46BDC6");
  private static final byte[] BLUE = rgb("4285F4");

  private CountWorkbookExporter() {}

  static byte[] export(List<MmCheckServer.CountItem> items) throws IOException {
    try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      String sheetName = LocalDate.now().format(DateTimeFormatter.ofPattern("MMyyyy"));
      XSSFSheet sheet = workbook.createSheet(sheetName);
      sheet.createFreezePane(0, 1);
      sheet.setAutobreaks(true);
      sheet.setHorizontallyCenter(true);
      sheet.getPrintSetup().setLandscape(true);
      sheet.getPrintSetup().setFitWidth((short) 1);
      sheet.getPrintSetup().setFitHeight((short) 0);

      CellStyle headerStyle = headerStyle(workbook);
      CellStyle centeredStyle = bodyStyle(workbook, HorizontalAlignment.CENTER);
      CellStyle descriptionStyle = bodyStyle(workbook, HorizontalAlignment.LEFT);
      Row header = sheet.createRow(0);
      for (int column = 0; column < HEADERS.length; column++) {
        Cell cell = header.createCell(column);
        cell.setCellValue(HEADERS[column]);
        cell.setCellStyle(headerStyle);
      }
      Cell summaryHeader = header.createCell(19);
      summaryHeader.setCellValue("Sumário");
      summaryHeader.setCellStyle(headerStyle);
      Cell colorHeader = header.createCell(20);
      colorHeader.setCellValue("Cor");
      colorHeader.setCellStyle(headerStyle);

      for (int index = 0; index < items.size(); index++) {
        MmCheckServer.CountItem item = items.get(index);
        int rowNumber = index + 2;
        Row row = sheet.createRow(index + 1);
        String[] sku = item.sku().split("\\.", -1);
        setIdentifier(row, 0, sku, 0, centeredStyle);
        setIdentifier(row, 1, sku, 1, centeredStyle);
        setIdentifier(row, 2, sku, 2, centeredStyle);
        setText(row, 3, item.description(), descriptionStyle);
        for (int column = 4; column <= 13; column++) setNumber(row, column, 0, centeredStyle, true);
        setNumber(row, 8, item.counted(), centeredStyle, false);
        setNumber(row, 10, item.assistance(), centeredStyle, true);
        setNumber(row, 11, item.damaged(), centeredStyle, true);
        setNumber(row, 12, item.other(), centeredStyle, true);
        Cell total = row.createCell(14);
        total.setCellFormula("SUM(E" + rowNumber + ":N" + rowNumber + ")");
        total.setCellStyle(centeredStyle);
        setNumber(row, 15, item.system(), centeredStyle, false);
        Cell difference = row.createCell(16);
        difference.setCellFormula("O" + rowNumber + "-P" + rowNumber);
        difference.setCellStyle(centeredStyle);
        setBlank(row, 17, descriptionStyle);
      }

      addLegend(sheet, workbook, descriptionStyle);
      int lastRow = Math.max(2, items.size() + 1);
      sheet.setAutoFilter(new CellRangeAddress(0, lastRow - 1, 0, 17));
      addConditionalColors(sheet, lastRow);
      setWidths(sheet);
      sheet.setRepeatingRows(CellRangeAddress.valueOf("1:1"));
      workbook.getCreationHelper().createFormulaEvaluator().evaluateAll();
      workbook.setForceFormulaRecalculation(true);
      workbook.write(output);
      return output.toByteArray();
    }
  }

  private static void addConditionalColors(XSSFSheet sheet, int lastRow) {
    var formatting = sheet.getSheetConditionalFormatting();
    CellRangeAddress[] rows = {new CellRangeAddress(1, lastRow - 1, 0, 17)};
    addRule(formatting, rows, "$R2=\"Inversão\"", CYAN);
    addRule(formatting, rows, "$R2=\"Outro\"", BLUE);
    addRule(formatting, rows, "$Q2>0", YELLOW);
    addRule(formatting, rows, "$Q2<0", RED);
    addRule(formatting, rows, "$Q2=0", GREEN);
  }

  private static void addRule(org.apache.poi.xssf.usermodel.XSSFSheetConditionalFormatting formatting,
                              CellRangeAddress[] rows, String formula, byte[] color) {
    XSSFConditionalFormattingRule rule = formatting.createConditionalFormattingRule(formula);
    XSSFPatternFormatting pattern = rule.createPatternFormatting();
    pattern.setFillPattern(FillPatternType.SOLID_FOREGROUND.getCode());
    pattern.setFillForegroundColor(new XSSFColor(color, null));
    formatting.addConditionalFormatting(rows, rule);
  }

  private static void addLegend(Sheet sheet, XSSFWorkbook workbook, CellStyle textStyle) {
    byte[][] colors = {GREEN, YELLOW, RED, CYAN, BLUE};
    for (int index = 0; index < LEGEND.length; index++) {
      Row row = sheet.getRow(index + 1);
      if (row == null) row = sheet.createRow(index + 1);
      setText(row, 19, LEGEND[index], textStyle);
      Cell color = row.createCell(20);
      XSSFCellStyle style = workbook.createCellStyle();
      style.cloneStyleFrom(textStyle);
      style.setFillForegroundColor(new XSSFColor(colors[index], null));
      style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
      color.setCellStyle(style);
    }
  }

  private static CellStyle headerStyle(XSSFWorkbook workbook) {
    XSSFCellStyle style = baseStyle(workbook);
    XSSFFont font = workbook.createFont();
    font.setFontName("Arial");
    font.setFontHeightInPoints((short) 12);
    font.setBold(true);
    style.setFont(font);
    style.setAlignment(HorizontalAlignment.CENTER);
    style.setFillForegroundColor(new XSSFColor(new byte[]{(byte) 255, (byte) 255, (byte) 255}, null));
    style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
    return style;
  }

  private static CellStyle bodyStyle(XSSFWorkbook workbook, HorizontalAlignment alignment) {
    XSSFCellStyle style = baseStyle(workbook);
    Font font = workbook.createFont();
    font.setFontName("Arial");
    font.setFontHeightInPoints((short) 12);
    style.setFont(font);
    style.setAlignment(alignment);
    style.setVerticalAlignment(VerticalAlignment.BOTTOM);
    return style;
  }

  private static XSSFCellStyle baseStyle(XSSFWorkbook workbook) {
    XSSFCellStyle style = workbook.createCellStyle();
    style.setBorderTop(BorderStyle.THIN);
    style.setBorderBottom(BorderStyle.THIN);
    style.setBorderLeft(BorderStyle.THIN);
    style.setBorderRight(BorderStyle.THIN);
    style.setTopBorderColor(IndexedColors.BLACK.getIndex());
    style.setBottomBorderColor(IndexedColors.BLACK.getIndex());
    style.setLeftBorderColor(IndexedColors.BLACK.getIndex());
    style.setRightBorderColor(IndexedColors.BLACK.getIndex());
    return style;
  }

  private static void setIdentifier(Row row, int column, String[] parts, int part, CellStyle style) {
    String value = part < parts.length ? parts[part] : "";
    Cell cell = row.createCell(column);
    try {
      cell.setCellValue(Long.parseLong(value));
    } catch (NumberFormatException ignored) {
      cell.setCellValue(value);
    }
    cell.setCellStyle(style);
  }

  private static void setText(Row row, int column, String value, CellStyle style) {
    Cell cell = row.createCell(column);
    cell.setCellValue(value == null ? "" : value);
    cell.setCellStyle(style);
  }

  private static void setBlank(Row row, int column, CellStyle style) {
    Cell cell = row.createCell(column);
    cell.setBlank();
    cell.setCellStyle(style);
  }

  private static void setNumber(Row row, int column, int value, CellStyle style, boolean blankWhenZero) {
    Cell cell = row.getCell(column);
    if (cell == null) cell = row.createCell(column);
    if (!blankWhenZero || value != 0) cell.setCellValue(value);
    else cell.setBlank();
    cell.setCellStyle(style);
  }

  private static void setWidths(Sheet sheet) {
    double[] widths = {12.63, 8.13, 15.25, 67, 22.38, 11.38, 15, 13.88, 16.5, 9.38, 12.25,
        11.5, 11.5, 11.5, 13.13, 10.75, 15.63, 26.38, 6.38, 57.13, 25.13};
    for (int column = 0; column < widths.length; column++) {
      sheet.setColumnWidth(column, Math.min(255 * 256, (int) Math.round(widths[column] * 256)));
    }
  }

  private static byte[] rgb(String hex) {
    return new byte[]{
        (byte) Integer.parseInt(hex.substring(0, 2), 16),
        (byte) Integer.parseInt(hex.substring(2, 4), 16),
        (byte) Integer.parseInt(hex.substring(4, 6), 16)
    };
  }
}
