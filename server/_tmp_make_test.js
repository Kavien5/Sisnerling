const ExcelJS = require("exceljs");

(async () => {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet("Sheet Alpha");
  a.getCell("A1").value = "Kode";
  a.getCell("B1").value = "Nama";
  a.getCell("C1").value = "Total";
  a.getCell("A2").value = "X1";
  a.getCell("B2").value = "Bahan Baku";
  a.getCell("C2").value = 1500;
  a.getCell("C2").numFmt = "#,##0";
  a.getCell("A3").value = "X2";
  a.getCell("B3").value = "Olahan";
  a.getCell("C3").value = { formula: "C2*2" };
  a.mergeCells("A5:C5");
  a.getCell("A5").value = "CATATAN BERSAMA";
  a.getColumn(2).width = 45;
  a.getCell("B2").border = { bottom: { style: "thin" } };

  const b = wb.addWorksheet("Sheet Beta");
  b.getCell("A1").value = "Kolom";
  b.getCell("B1").value = "Nilai";
  b.getCell("A2").value = "Total-inline";
  b.getCell("B2").value = 99;
  b.state = "hidden";

  await wb.xlsx.writeFile("C:/Users/Asus/AppData/Local/Temp/opencode/uji.xlsx");
  console.log("test file dibuat: uji.xlsx");
})();