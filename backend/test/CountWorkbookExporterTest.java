package br.com.mncheck;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

class CountWorkbookExporterTest {
  @Test
  void exportsRealXlsxWithFormulasAndDynamicColorRules() throws Exception {
    byte[] bytes = CountWorkbookExporter.export(List.of(
        new MmCheckServer.CountItem("1191.3.1", "FERRO DE PASSAR", 179, 170, 2, 1, -4),
        new MmCheckServer.CountItem("2552.1.2", "REFRIGERADOR", 16, 11, 0, 4, 0),
        new MmCheckServer.CountItem("1363.1.1", "PANELA ELÉTRICA", 3, 7, 0, 0, -4)
    ));

    assertTrue(bytes.length > 1_000);
    Files.createDirectories(Path.of("target"));
    Files.write(Path.of("target", "contagem-formatada-teste.xlsx"), bytes);
    try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
      var sheet = workbook.getSheetAt(0);
      assertEquals("Código", sheet.getRow(0).getCell(0).getStringCellValue());
      assertEquals(1191, sheet.getRow(1).getCell(0).getNumericCellValue());
      assertEquals("FERRO DE PASSAR", sheet.getRow(1).getCell(3).getStringCellValue());
      assertEquals(170, sheet.getRow(1).getCell(8).getNumericCellValue());
      assertEquals(2, sheet.getRow(1).getCell(10).getNumericCellValue());
      assertEquals(1, sheet.getRow(1).getCell(11).getNumericCellValue());
      assertEquals(-4, sheet.getRow(1).getCell(12).getNumericCellValue());
      assertEquals("SUM(E2:N2)", sheet.getRow(1).getCell(14).getCellFormula());
      assertEquals("O2-P2", sheet.getRow(1).getCell(16).getCellFormula());
      assertEquals(CellType.FORMULA, sheet.getRow(1).getCell(16).getCellType());
      assertEquals(5, sheet.getSheetConditionalFormatting().getNumConditionalFormattings());
      assertEquals("$Q2>0", sheet.getSheetConditionalFormatting().getConditionalFormattingAt(2).getRule(0).getFormula1());
      assertEquals("$Q2<0", sheet.getSheetConditionalFormatting().getConditionalFormattingAt(3).getRule(0).getFormula1());
      assertEquals("$Q2=0", sheet.getSheetConditionalFormatting().getConditionalFormattingAt(4).getRule(0).getFormula1());
      assertEquals("FFFBBC04", sheet.getSheetConditionalFormatting().getConditionalFormattingAt(2).getRule(0)
          .getPatternFormatting().getFillForegroundColorColor().getARGBHex());
      assertEquals("FFEA4335", sheet.getSheetConditionalFormatting().getConditionalFormattingAt(3).getRule(0)
          .getPatternFormatting().getFillForegroundColorColor().getARGBHex());
      assertEquals("FF34A853", sheet.getSheetConditionalFormatting().getConditionalFormattingAt(4).getRule(0)
          .getPatternFormatting().getFillForegroundColorColor().getARGBHex());
      assertEquals(CellType.BLANK, sheet.getRow(1).getCell(17).getCellType());
      assertEquals("Contagem = Saldo", sheet.getRow(1).getCell(19).getStringCellValue());
    }
  }
}
