import {
  Document as PdfDocument,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type {
  Customer,
  Document as DocumentRow,
  DocumentLine,
  Tenant,
} from "@/db/schema";
import { formatAmount, formatDateOnly, formatQty } from "@/domain/format";
import { CONSUMIDOR_FINAL_RUC, formatRuc } from "@/domain/ruc";
import { formatWhatsapp } from "@/domain/whatsapp";
import type { PdfLabels } from "./labels";

/**
 * The printed document (ARCHITECTURE.md: "PDFs always light").
 *
 * Built with `@react-pdf/renderer` rather than headless Chrome — Hostinger's
 * Node slots have no browser, and this is pure JS.
 *
 * Two rules shape the layout:
 *
 * 1. Prices are IVA-**inclusive**, so the line column is what the customer
 *    pays and the IVA breakdown reports the tax *contained in* the totals.
 *    The `LIQUIDACIÓN DEL IVA` strip at the foot is what a Paraguayan
 *    accountant looks for first.
 * 2. Money is rendered through `domain/format` from integer minor units —
 *    there is no arithmetic anywhere in this file.
 *
 * The guaraní sign is written as `Gs.` here rather than `₲`: the PDF standard
 * fonts encode WinAnsi only, and U+20B2 is not in it. The app UI keeps `₲`.
 */

const INK = "#111827";
const MUTED = "#6B7280";
const HAIRLINE = "#E5E7EB";
const ACCENT = "#0F766E";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
    backgroundColor: "#FFFFFF",
  },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  companyBlock: { maxWidth: 280 },
  logo: { maxWidth: 140, maxHeight: 48, marginBottom: 6, objectFit: "contain" },
  companyName: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  muted: { color: MUTED },
  docBlock: {
    minWidth: 170,
    borderWidth: 1,
    borderColor: HAIRLINE,
    borderRadius: 3,
    padding: 10,
  },
  docKind: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  docNumber: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  section: {
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
    paddingTop: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 7.5,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
  },
  cellDescription: { flex: 1, paddingRight: 6 },
  cellQty: { width: 46, textAlign: "right" },
  cellUnit: { width: 46, paddingLeft: 6 },
  cellRate: { width: 42, textAlign: "right" },
  cellAmount: { width: 74, textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  totals: { marginTop: 12, flexDirection: "row", justifyContent: "flex-end" },
  totalsBox: { width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: INK,
    marginTop: 4,
    paddingTop: 4,
  },
  ivaStrip: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: HAIRLINE,
    borderRadius: 3,
    padding: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  notes: { marginTop: 14 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7.5,
    color: MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export type DocumentPdfProps = {
  tenant: Tenant;
  document: DocumentRow;
  lines: DocumentLine[];
  customer: Customer | null;
  labels: PdfLabels;
  /** Data URI of the tenant logo, when one could be fetched. */
  logoDataUri?: string | null;
};

/** `Gs. 1.500.000` / `US$ 1.234,56` — WinAnsi-safe currency rendering. */
function pdfMoney(amount: number, currency: DocumentRow["currency"]): string {
  const symbol = currency === "PYG" ? "Gs." : "US$";
  return `${symbol} ${formatAmount(amount, currency)}`;
}

function kindLabel(type: DocumentRow["type"], labels: PdfLabels): string {
  if (type === "quote") return labels.quote;
  if (type === "credit_note") return labels.creditNote;
  return labels.invoice;
}

export function DocumentPdf({
  tenant,
  document,
  lines,
  customer,
  labels,
  logoDataUri,
}: DocumentPdfProps) {
  const currency = document.currency;
  const tenantRuc = formatRuc(tenant.rucBase, tenant.rucDv);
  const customerRuc = customer?.isConsumidorFinal
    ? CONSUMIDOR_FINAL_RUC
    : formatRuc(customer?.rucBase, customer?.rucDv);

  return (
    <PdfDocument
      title={`${kindLabel(document.type, labels)} ${document.number ?? ""}`.trim()}
      author={tenant.name}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            {/* @react-pdf/renderer's <Image> is a PDF primitive, not an
                <img>: it has no alt prop to give. */}
            {logoDataUri ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoDataUri} style={styles.logo} />
            ) : null}
            <Text style={styles.companyName}>{tenant.name}</Text>
            {tenantRuc ? (
              <Text style={styles.muted}>
                {labels.ruc}: {tenantRuc}
              </Text>
            ) : null}
            {tenant.address ? <Text style={styles.muted}>{tenant.address}</Text> : null}
            {tenant.phone ? (
              <Text style={styles.muted}>{formatWhatsapp(tenant.phone) ?? tenant.phone}</Text>
            ) : null}
            {tenant.email ? <Text style={styles.muted}>{tenant.email}</Text> : null}
          </View>

          <View style={styles.docBlock}>
            <Text style={styles.docKind}>{kindLabel(document.type, labels)}</Text>
            <Text style={styles.docNumber}>{document.number ?? labels.draft}</Text>
            {document.issueDate ? (
              <View style={styles.row}>
                <Text style={styles.muted}>{labels.issueDate}</Text>
                <Text>{formatDateOnly(document.issueDate)}</Text>
              </View>
            ) : null}
            {document.validUntil ? (
              <View style={styles.row}>
                <Text style={styles.muted}>{labels.validUntil}</Text>
                <Text>{formatDateOnly(document.validUntil)}</Text>
              </View>
            ) : null}
            {document.dueDate ? (
              <View style={styles.row}>
                <Text style={styles.muted}>{labels.dueDate}</Text>
                <Text>{formatDateOnly(document.dueDate)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{labels.customer}</Text>
          <Text style={styles.bold}>{customer?.name ?? labels.consumidorFinal}</Text>
          <Text style={styles.muted}>
            {labels.ruc}: {customerRuc ?? CONSUMIDOR_FINAL_RUC}
          </Text>
          {customer?.address ? <Text style={styles.muted}>{customer.address}</Text> : null}
          {customer?.whatsapp ? (
            <Text style={styles.muted}>
              {labels.whatsapp}: {formatWhatsapp(customer.whatsapp)}
            </Text>
          ) : null}
          {customer?.email ? <Text style={styles.muted}>{customer.email}</Text> : null}
        </View>

        <View>
          <View style={styles.tableHead}>
            <Text style={[styles.cellDescription, styles.bold]}>{labels.description}</Text>
            <Text style={[styles.cellQty, styles.bold]}>{labels.qty}</Text>
            <Text style={[styles.cellUnit, styles.bold]}>{labels.unit}</Text>
            <Text style={[styles.cellAmount, styles.bold]}>{labels.unitPrice}</Text>
            <Text style={[styles.cellRate, styles.bold]}>{labels.taxRate}</Text>
            <Text style={[styles.cellAmount, styles.bold]}>{labels.lineTotal}</Text>
          </View>

          {lines.map((line) => (
            <View key={line.id} style={styles.tableRow} wrap={false}>
              <Text style={styles.cellDescription}>{line.description}</Text>
              <Text style={styles.cellQty}>{formatQty(line.qty)}</Text>
              <Text style={styles.cellUnit}>{line.unit}</Text>
              <Text style={styles.cellAmount}>{pdfMoney(line.unitAmount, currency)}</Text>
              <Text style={styles.cellRate}>
                {line.taxRate === "exenta" ? labels.exempt : `${line.taxRate}%`}
              </Text>
              <Text style={styles.cellAmount}>{pdfMoney(line.lineTotal, currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            {document.subtotal10 > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.muted}>{labels.subtotal10}</Text>
                <Text>{pdfMoney(document.subtotal10, currency)}</Text>
              </View>
            ) : null}
            {document.subtotal5 > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.muted}>{labels.subtotal5}</Text>
                <Text>{pdfMoney(document.subtotal5, currency)}</Text>
              </View>
            ) : null}
            {document.subtotalExenta > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.muted}>{labels.subtotalExenta}</Text>
                <Text>{pdfMoney(document.subtotalExenta, currency)}</Text>
              </View>
            ) : null}

            <View style={styles.grandTotal}>
              <Text style={styles.bold}>{labels.total}</Text>
              <Text style={styles.bold}>{pdfMoney(document.total, currency)}</Text>
            </View>
          </View>
        </View>

        {/* The IVA liquidation strip: the tax already contained in the totals
            above, per rate. This is the block an accountant reads first. */}
        <View style={styles.ivaStrip}>
          <View>
            <Text style={styles.sectionTitle}>{labels.iva10}</Text>
            <Text>{pdfMoney(document.iva10, currency)}</Text>
          </View>
          <View>
            <Text style={styles.sectionTitle}>{labels.iva5}</Text>
            <Text>{pdfMoney(document.iva5, currency)}</Text>
          </View>
          <View>
            <Text style={styles.sectionTitle}>{labels.ivaTotal}</Text>
            <Text style={styles.bold}>
              {pdfMoney(document.iva10 + document.iva5, currency)}
            </Text>
          </View>
          <View style={{ maxWidth: 200 }}>
            <Text style={styles.muted}>{labels.ivaIncludedNote}</Text>
          </View>
        </View>

        {document.notes ? (
          <View style={styles.notes}>
            <Text style={styles.sectionTitle}>{labels.notes}</Text>
            <Text>{document.notes}</Text>
          </View>
        ) : null}

        {document.type === "quote" && document.validUntil ? (
          <View style={styles.notes}>
            <Text style={styles.bold}>
              {labels.validityNote.replace("{date}", formatDateOnly(document.validUntil))}
            </Text>
            <Text style={styles.muted}>{labels.notAnInvoice}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{tenant.name}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              labels.page
                .replace("{page}", String(pageNumber))
                .replace("{total}", String(totalPages))
            }
          />
        </View>
      </Page>
    </PdfDocument>
  );
}
