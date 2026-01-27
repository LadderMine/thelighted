export function exportCSV(filename: string, rows: any[]) {
  const csv =
    Object.keys(rows[0]).join(",") +
    "\n" +
    rows.map(r => Object.values(r).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
