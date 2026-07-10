import * as pdfjsLib from "../pdfjs-6.1.200-dist%20(1)/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
    new URL("../pdfjs-6.1.200-dist%20(1)/build/pdf.worker.mjs", import.meta.url).href;

const PDF_PART_SIZE = 1000;
const PDF_PAGE_COUNT = 4513;
const PDF_PART_URLS = [1, 2, 3, 4, 5].map(part =>
    new URL(`../books/saheeh-muslim-parts/saheeh-muslim-part-${part}.pdf`, import.meta.url).href
);
const IS_LOCAL = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API_BASE_URL = IS_LOCAL
    ? "http://localhost:8080"
    : "https://athar-notes-api-ali-dev.onrender.com";

let pdfDoc = null,
    pageNum = 1,
    partIndex = 0,
    partPageNum = 1,
    pageIsRendering = false,
    pageNumIsPending = null;

const scale = 1,
    canvas = document.querySelector('#pdf-render'),
    ctx = canvas.getContext('2d');

const section1 = document.querySelector("#notes-section1 textarea");
const section2 = document.querySelector("#notes-section2 textarea");



console.log("main.js reached the fetch");

// fetch("http://localhost:8080/note")
//     .then(response => {
//         console.log(response);

//     })


// Render the page

const renderPage = partPage => {
    pageIsRendering = true;

    pdfDoc.getPage(partPage).then(page => {


        // Set scale
        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;


        const renderCtx = {
            canvasContext: ctx,
            viewport
        }

        const renderTask = page.render(renderCtx);

        renderTask.promise.then(() => {
            console.log("Page rendered");

            pageIsRendering = false;

            if (pageNumIsPending !== null) {
                renderPage(pageNumIsPending);
                pageNumIsPending = null;
            }
        }).catch(err => {
            console.error("Render failed:", err);
        });

        // Output current page
        partPageNum = partPage;
        pageNum = (partIndex * PDF_PART_SIZE) + partPage;
        document.querySelector('#page-num').textContent = pageNum;
        displayNotesForPage(pageNum);
    });
}

// Check for pages rendering
const queueRenderPage = num => {
    if (pageIsRendering) {
        pageNumIsPending = num;
    } else {
        renderPage(num);
    }
}

// Show Prev Page
const showPrevPage = () => {
    if (!pdfDoc || pageNum <= 1) {
        return;
    }

    if (partPageNum > 1) {
        queueRenderPage(partPageNum - 1);
        return;
    }

    loadPdfPart(partIndex - 1, PDF_PART_SIZE);
}

// Show Next Page
const showNextPage = () => {
    if (!pdfDoc || pageNum >= PDF_PAGE_COUNT) {
        return;
    }

    if (partPageNum < pdfDoc.numPages) {
        queueRenderPage(partPageNum + 1);
        return;
    }

    loadPdfPart(partIndex + 1, 1);
}

const loadPdfPart = (newPartIndex, targetPage) => {
    pageIsRendering = true;
    pageNumIsPending = null;

    return pdfjsLib.getDocument({
        url: PDF_PART_URLS[newPartIndex],
        cMapUrl: new URL("../pdfjs-6.1.200-dist%20(1)/web/cmaps/", import.meta.url).href,
        cMapPacked: true,
        standardFontDataUrl: new URL("../pdfjs-6.1.200-dist%20(1)/web/standard_fonts/", import.meta.url).href,
        wasmUrl: new URL("../pdfjs-6.1.200-dist%20(1)/web/wasm/", import.meta.url).href,
        iccUrl: new URL("../pdfjs-6.1.200-dist%20(1)/web/iccs/", import.meta.url).href
    }).promise.then(loadedPdf => {
        pdfDoc = loadedPdf;
        partIndex = newPartIndex;
        pageIsRendering = false;
        renderPage(targetPage);
    }).catch(error => {
        pageIsRendering = false;
        console.error("Could not load PDF volume:", error);
    });
};

document.querySelector('#page-count').textContent = PDF_PAGE_COUNT;
loadPdfPart(0, 1);

// Button Events
document.querySelector('#prev-page').addEventListener('click', showPrevPage);
document.querySelector('#next-page').addEventListener('click', showNextPage);

// get old notes
let notes = [];

fetch(`${API_BASE_URL}/note`)
    .then(response => {
        if (!response.ok) {
            throw new Error(`Could not load notes: ${response.status}`);
        }
        return response.json();
    })
    .then(fetchedNotes => {
        notes = fetchedNotes;
        displayNotesForPage(pageNum);
    })
    .catch(error => {
        console.error("Could not load notes:", error);
    });

const displayNotesForPage = page => {
    const pageNotes = notes.filter(note => note.page === page);

    section1.value = pageNotes
        .map(note => note.section1)
        .join("\n\n");

    section2.value = pageNotes
        .map(note => note.section2)
        .join("\n\n");
};

// auto-save
let autoSaveTimer;

const scheduleAutoSave = () => {
    clearTimeout(autoSaveTimer);

    const pageBeingEdited = pageNum;
    const noteBeingEdited = {
        section1: section1.value,
        section2: section2.value
    };

    autoSaveTimer = setTimeout(() => {
        autoSaveNote(pageBeingEdited, noteBeingEdited);
    }, 800);
};

section1.addEventListener("input", scheduleAutoSave);
section2.addEventListener("input", scheduleAutoSave);

const autoSaveNote = (page, note) => {
    fetch(`${API_BASE_URL}/note/${page}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(note)
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Autosave failed: ${response.status}`);
            }

            const existingNote = notes.find(
                savedNote => savedNote.page === page
            );

            if (existingNote) {
                existingNote.section1 = note.section1;
                existingNote.section2 = note.section2;
            } else {
                notes.push({
                    page: page,
                    section1: note.section1,
                    section2: note.section2
                });
            }

            console.log(`Page ${page} saved`);
        })
        .catch(error => {
            console.error(error);
        });
};
