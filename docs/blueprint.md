# **App Name**: AB INTERIORS

## Core Features:

- Invoice Data Input: Enables input of customer details (name, address, contact, GST), and the addition of products/services (item name, quantity, rate, description).
- Automatic Calculation: Automatically calculates the total price per item, grand total in ₹, amount paid, and remaining balance.
- Invoice Generation & Export: Generates invoices with AB INTERIORS branding, customer details, itemized list, totals, invoice number, date, and due date. Allows for local saving using localStorage and PDF download using html2pdf.js. also we can search for the particular entry also

## Style Guidelines:

- Primary color: Soft Teal (#A0D9D9) for a professional yet approachable feel.
- Secondary color: Light Gray (#F2F2F2) for backgrounds to ensure readability.
- Accent: Coral (#FF7F50) for highlights and call-to-action buttons.
- Mobile-responsive design using Tailwind CSS grid and flexbox layouts.
- Use simple, line-based icons for clarity and a modern aesthetic.
- Subtle transitions and animations for a smooth user experience.

## Original User Request:
I need a functional billing and invoice generator web application built using Next.js as the framework and Tailwind CSS for responsive and clean styling. The app should allow users to input customer details such as name, address, phone number, and GST number. It should also enable users to add products or services, which includes entering item name, quantity, rate per item, and a description. The app should automatically calculate the total price per item and compute a grand total in Indian Rupees (₹). The application should also track the amount paid, the remaining balance, and allow the user to edit the payment status of an invoice.

Each invoice should prominently display the title "AB INTERIORS" at the top, and there should be an option for the user to upload a custom logo that persists across sessions. Below the title, the invoice should contain a "Billing From" section with AB INTERIORS' address and contact details, and a "Bill To" section for the customer's information. A detailed table listing the items, quantity, description, price per item, and total amount should be included, and the invoice should also display metadata such as the invoice number, invoice date, and due date. A footer should state "System Generated Invoice - AB INTERIORS."

The app should be able to generate and save invoices locally using localStorage, allowing users to view, print, or delete saved invoices. The user should be able to download the invoice as a PDF file, generated client-side using html2pdf.js. The application should support pagination when listing saved invoices, and ensure the app primarily operates in Indian Rupees (₹). While the app can use SQLite with Prisma for more advanced storage options, localStorage is preferred for simplicity. The design must be mobile-responsive, clean, and easy to use.
  