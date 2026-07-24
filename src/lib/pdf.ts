import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AppConfig, PageRecord } from "../types";
import { buildFileName, buildStoragePath } from "../config";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfParseContext {
  grade: string;
  term: string;
  bookTitle: string;
}

export async function parsePdfToImages(
  file: File,
  config: AppConfig,
  context: PdfParseContext,
  onPage: (record: PageRecord, total: number) => void
): Promise<PageRecord[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const total = pdf.numPages;
  const records: PageRecord[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: config.renderScale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D canvas context");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    } as RenderParametersLike).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        config.imageFormat,
        config.imageFormat === "image/jpeg" ? config.jpegQuality : undefined
      );
    });

    const pageIndex = i;
    const fileName = buildFileName(pageIndex, config);
    const storagePath = buildStoragePath(
      fileName,
      { grade: context.grade, term: context.term },
      config
    );

    const record: PageRecord = {
      index: pageIndex,
      pageNumber: i,
      fileName,
      storagePath,
      blob,
      status: "pending",
    };
    records.push(record);
    onPage(record, total);

    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }

  try {
    await pdf.destroy();
  } catch {
    /* ignore */
  }
  return records;
}

interface RenderParametersLike {
  canvasContext: CanvasRenderingContext2D;
  viewport: import("pdfjs-dist").PageViewport;
  canvas?: HTMLCanvasElement;
}
