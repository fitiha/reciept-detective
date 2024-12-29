import cors from "cors";
import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import https from "https";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.min.mjs";
import { fileURLToPath } from "url";
import { dirname } from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use(
  "/standard_fonts",
  express.static("node_modules/pdfjs-dist/standard_fonts")
);

app.post("/verify", async (req, res) => {
  const { accountNumber, referenceNumber } = req.body;

  if (!accountNumber || !referenceNumber) {
    return res.status(400).json({
      message: "Missing required parameters: accountNumber or referenceNumber",
    });
  }

  const accountLast8 = accountNumber.slice(-8);
  const url = `https://apps.cbe.com.et:100/?id=${referenceNumber}${accountLast8}`;

  const agent = new https.Agent({
    rejectUnauthorized: false, // Bypass SSL certificate verification
  });

  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      httpsAgent: agent,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
        Accept: "application/pdf",
      },
    });

    const pdfData = new Uint8Array(response.data);

    pdfjsLib.GlobalWorkerOptions.workerSrc = `${__dirname}/public/pdf.worker.min.mjs`;
    pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = "/standard_fonts/";

    // Load and parse the PDF
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    let textContent = "";

    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const text = await page.getTextContent();
      text.items.forEach((item) => {
        textContent += item.str.trim() + " ";
      });
    }

    const payerMatch = /Payer\s+([A-Za-z\s]+)/.exec(textContent);
    const amountMatch = /Transferred Amount\s+([0-9,\.]+)/.exec(textContent);
    const dateMatch =
      /Payment Date & Time\s+([0-9/]+, \d{1,2}:\d{2}:\d{2} [APM]{2})/.exec(
        textContent
      );

    const payer = payerMatch ? payerMatch[1] : "Not Found";
    const amount = amountMatch ? amountMatch[1] : "Not Found";
    const date = dateMatch ? dateMatch[1] : "Not Found";
    const isValid =
      amount !== "Not Found" && payer !== "Not Found" && date !== "Not Found";

    res.json({
      isValid,
      payer,
      amount,
      date,
    });
  } catch (error) {
    console.error("Error fetching data:", error.message);
    res
      .status(500)
      .json({ message: "Error fetching data", error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
