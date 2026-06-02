import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function createPdf() { 
  const pdfDoc = await PDFDocument.create(); 
  const page = pdfDoc.addPage(); 
  page.drawText('The RBI kept the repo rate unchanged at 6.5 percent.', { x: 50, y: 700 }); 
  page.drawText('Inflation is projected at 4.5 percent for the fiscal year.', { x: 50, y: 680 }); 
  const pdfBytes = await pdfDoc.save(); 
  fs.writeFileSync('sample.pdf', pdfBytes); 
} 
createPdf();
