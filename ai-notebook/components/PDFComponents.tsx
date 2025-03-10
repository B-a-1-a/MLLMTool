'use client';

import React from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PDFComponentsProps {
  file: string | { data: ArrayBuffer };
  currentPage: number;
  scale: number;
  onDocumentLoadSuccess: ({ numPages }: { numPages: number }) => void;
  onDocumentLoadError: (error: Error) => void;
}

const PDFComponents: React.FC<PDFComponentsProps> = ({
  file,
  currentPage,
  scale,
  onDocumentLoadSuccess,
  onDocumentLoadError
}) => {
  return (
    <Document
      file={file}
      onLoadSuccess={onDocumentLoadSuccess}
      onLoadError={onDocumentLoadError}
      loading={<div className="text-center py-20">Loading PDF...</div>}
      error={<div className="text-center py-10 text-red-500">Failed to load PDF. Please try again.</div>}
      options={{
        cMapUrl: 'https://unpkg.com/pdfjs-dist@3.4.120/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.4.120/standard_fonts/'
      }}
    >
      <Page
        key={`page_${currentPage}`}
        pageNumber={currentPage}
        renderTextLayer={true}
        renderAnnotationLayer={true}
        scale={scale}
        className="mx-auto bg-white shadow-md"
        loading={<div className="text-center py-20">Loading page {currentPage}...</div>}
        error={<div className="text-center py-10 text-red-500">Error loading page {currentPage}</div>}
      />
    </Document>
  );
};

export default PDFComponents;