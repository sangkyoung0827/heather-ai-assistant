declare module "pdf-parse" {
  export type PdfParseResult = { text?: string; numpages?: number };
  export default function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
}
