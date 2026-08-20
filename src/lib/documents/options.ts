import "server-only";

import { listCustomers } from "@/lib/customers/data";
import { listProducts } from "@/lib/products/data";
import { formatAmount } from "@/domain/format";
import type {
  CustomerOption,
  ProductOption,
} from "@/components/documents/line-editor";

/**
 * The pickers a document editor needs. Both lists are already tenant-scoped by
 * their own data modules, and both hide deactivated rows — a quote should not
 * offer a product that was retired.
 */
export async function documentEditorOptions(tenantId: number): Promise<{
  customers: CustomerOption[];
  products: ProductOption[];
}> {
  const [customers, products] = await Promise.all([
    listCustomers(tenantId),
    listProducts(tenantId),
  ]);

  return {
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      docLocale: customer.docLocale,
    })),
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      unit: product.unit,
      // Handed over the way a human types it, so it lands in the form field
      // and is read back by the same parser.
      unitAmount: formatAmount(product.unitAmount, product.currency),
      currency: product.currency,
      taxRate: product.taxRate,
    })),
  };
}
