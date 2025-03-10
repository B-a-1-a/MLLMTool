'use client';

import React, { useState, useEffect, useRef } from 'react';

interface CustomPDFViewerProps {
  file: string;
  onTextContentChange?: (text: string) => void; // New prop to pass text content back to parent
}

const CustomPDFViewer: React.FC<CustomPDFViewerProps> = ({ file, onTextContentChange }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [textContent, setTextContent] = useState<string>('');
  const [allTextContent, setAllTextContent] = useState<string[]>([]); // Store text content for all pages
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    let pdfDoc: any = null;
    let pdfjs: any = null;

    const loadPDF = async () => {
      if (!mounted) return;
      
      setIsLoading(true);
      setError(null);
      setAllTextContent([]); // Reset text content when loading a new PDF
      
      try {
        // Dynamically import PDF.js
        const pdfjsLib = await import('pdfjs-dist/webpack');
        pdfjs = pdfjsLib;
        
        // Configure worker
        const workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        
        // Load the PDF document
        pdfDoc = await pdfjsLib.getDocument(file).promise;
        
        if (!mounted) return;
        
        setNumPages(pdfDoc.numPages);
        setCurrentPage(1);
        
        // Extract text from all pages
        const textContents: string[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          textContents.push(pageText);
        }
        
        setAllTextContent(textContents);
        
        // Combine all text content and pass it to the parent component
        const combinedText = textContents.join(' ');
        setTextContent(combinedText);
        
        if (onTextContentChange) {
          onTextContentChange(combinedText);
        }
        
        // Render the first page automatically
        renderPage(1, pdfDoc, pdfjsLib);
      } catch (err: any) {
        console.error('Error loading PDF:', err);
        if (mounted) {
          setError(`Failed to load PDF: ${err.message}`);
          setIsLoading(false);
        }
      }
    };

    const renderPage = async (pageNum: number, doc: any, pdfjsLib: any) => {
      if (!mounted || !canvasRef.current) return;
      
      setIsLoading(true);
      
      try {
        // Get the page
        const page = await doc.getPage(pageNum);
        
        // Set canvas dimensions
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Render PDF page into canvas context
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        // Extract text content for current page
        const textContent = await page.getTextContent();
        const textItems = textContent.items.map((item: any) => item.str).join(' ');
        setTextContent(textItems);
        
        if (!mounted) return;
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error rendering page:', err);
        if (mounted) {
          setError(`Failed to render page: ${err.message}`);
          setIsLoading(false);
        }
      }
    };

    loadPDF();

    // Cleanup function
    return () => {
      mounted = false;
    };
  }, [file, onTextContentChange]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      
      // Re-render the PDF with the new page
      import('pdfjs-dist/webpack').then((pdfjsLib) => {
        pdfjsLib.getDocument(file).promise.then((pdfDoc) => {
          renderPage(newPage, pdfDoc, pdfjsLib);
        });
      });
    }
  };

  const handleNextPage = () => {
    if (currentPage < numPages) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      
      // Re-render the PDF with the new page
      import('pdfjs-dist/webpack').then((pdfjsLib) => {
        pdfjsLib.getDocument(file).promise.then((pdfDoc) => {
          renderPage(newPage, pdfDoc, pdfjsLib);
        });
      });
    }
  };

  const renderPage = async (pageNum: number, doc: any, pdfjsLib: any) => {
    if (!canvasRef.current) return;
    
    setIsLoading(true);
    
    try {
      // Get the page
      const page = await doc.getPage(pageNum);
      
      // Set canvas dimensions
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // Render PDF page into canvas context
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
      
      // Update text content for the current page view
      if (allTextContent.length >= pageNum) {
        setTextContent(allTextContent[pageNum - 1]);
      }
      
      setIsLoading(false);
    } catch (err: any) {
      console.error('Error rendering page:', err);
      setError(`Failed to render page: ${err.message}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
      {error && (
        <div className="text-red-500 p-4 border border-red-300 rounded bg-red-50">
          <h3 className="font-bold">Error Loading PDF</h3>
          <p>{error}</p>
        </div>
      )}
      
      <div className="flex-1 overflow-auto relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent"></div>
          </div>
        )}
        
        <canvas ref={canvasRef} className="mx-auto shadow-md" />
      </div>
      
      {numPages > 0 && (
        <div className="flex items-center justify-between mt-4">
          <button 
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || isLoading}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <p>
            Page {currentPage} of {numPages}
          </p>
          <button 
            onClick={handleNextPage}
            disabled={currentPage >= numPages || isLoading}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
      
      {/* Hidden div for text content (not displayed) */}
      <div className="hidden">{textContent}</div>
    </div>
  );
};

export default CustomPDFViewer;