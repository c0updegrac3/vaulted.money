import { beforeEach, describe, expect, it } from "vitest";
import type { DataProvider } from "@/types/dataProvider";

export const defineDataProviderContract = (
  createProvider: () => DataProvider,
  reset: () => Promise<void>,
) => {
  describe("DataProvider contract", () => {
    let provider: DataProvider;

    beforeEach(async () => {
      await reset();
      provider = createProvider();
    });

    it("supports ledger CRUD and removes ledger-owned data", async () => {
      const ledger = await provider.addLedger({
        name: "Household",
        currency: "USD",
      });
      await provider.updateLedger({ ...ledger, name: "Home" });
      expect((await provider.getLedgers()).map(({ id }) => id)).toContain(
        ledger.id,
      );
      expect(
        (await provider.getLedgers()).find(({ id }) => id === ledger.id)?.name,
      ).toBe("Home");

      await provider.addTransaction({
        user_id: ledger.id,
        date: "2026-01-01",
        amount: -12,
        currency: "USD",
        account: "Checking",
        vendor: "Shop",
        category: "Food",
      });
      await provider.deleteLedger(ledger.id);

      expect(await provider.getLedgers()).toHaveLength(0);
      expect(await provider.getTransactions(ledger.id)).toHaveLength(0);
      expect(await provider.getAllVendors(ledger.id)).toHaveLength(0);
      expect(await provider.getUserCategories(ledger.id)).toHaveLength(0);
    });

    it("keeps ensure operations idempotent", async () => {
      const firstCategory = await provider.ensureCategoryExists("Food", "l1");
      const secondCategory = await provider.ensureCategoryExists(
        " Food ",
        "l1",
      );
      expect(secondCategory).toBe(firstCategory);

      const firstSubCategory = await provider.ensureSubCategoryExists(
        "Produce",
        firstCategory!,
        "l1",
      );
      const secondSubCategory = await provider.ensureSubCategoryExists(
        " Produce ",
        firstCategory!,
        "l1",
      );
      expect(secondSubCategory).toBe(firstSubCategory);

      const firstPayee = await provider.ensurePayeeExists(
        "Market",
        false,
        "l1",
      );
      const secondPayee = await provider.ensurePayeeExists(
        "Market",
        false,
        "l1",
      );
      expect(secondPayee).toBe(firstPayee);
      expect(await provider.getAllVendors("l1")).toHaveLength(1);
    });

    it("supports transfer linking, lookup, and unlinking", async () => {
      const outgoing = await provider.addTransaction({
        user_id: "l1",
        date: "2026-01-01",
        amount: -25,
        currency: "USD",
        account: "Checking",
        vendor: "Savings",
        category: "Transfer",
      });
      const incoming = await provider.addTransaction({
        user_id: "l1",
        date: "2026-01-01",
        amount: 25,
        currency: "USD",
        account: "Savings",
        vendor: "Checking",
        category: "Transfer",
      });

      await provider.linkTransactionsAsTransfer(
        outgoing.id,
        incoming.id,
        "pair-1",
      );
      expect(
        await provider.getTransactionsByTransferId("pair-1", "l1"),
      ).toHaveLength(2);
      expect(
        (await provider.getTransactionById(outgoing.id))?.transfer_id,
      ).toBe("pair-1");

      await provider.unlinkTransactions("pair-1");
      expect(
        await provider.getTransactionsByTransferId("pair-1", "l1"),
      ).toHaveLength(0);
      expect(await provider.getTransactionById(outgoing.id)).toMatchObject({
        id: outgoing.id,
        transfer_id: null,
      });
    });

    it("preserves bulk-delete behavior without cascading", async () => {
      const payeeId = await provider.ensurePayeeExists("Shop", false, "l1");
      const categoryId = await provider.ensureCategoryExists("Food", "l1");
      const transaction = await provider.addTransaction({
        user_id: "l1",
        date: "2026-01-01",
        amount: -5,
        currency: "USD",
        account: "Checking",
        vendor: "Shop",
        category: "Food",
      });

      await provider.deleteMultiplePayees([payeeId!]);
      await provider.deleteMultipleCategories([categoryId!]);

      expect(await provider.getVendorById(payeeId!)).toBeUndefined();
      expect(await provider.getCategoryById(categoryId!)).toBeUndefined();
      expect(await provider.getTransactionById(transaction.id)).toBeDefined();
    });

    it("keeps bulk transaction deletion limited to the requested IDs", async () => {
      const first = await provider.addTransaction({
        user_id: "l1",
        date: "2026-01-01",
        amount: -10,
        currency: "USD",
        account: "Checking",
        vendor: "Shop",
        category: "Food",
      });
      const second = await provider.addTransaction({
        user_id: "l1",
        date: "2026-01-01",
        amount: 10,
        currency: "USD",
        account: "Savings",
        vendor: "Checking",
        category: "Transfer",
      });
      await provider.linkTransactionsAsTransfer(first.id, second.id, "pair-2");

      await provider.deleteMultipleTransactions([first.id]);

      expect(await provider.getTransactionById(first.id)).toBeUndefined();
      expect(await provider.getTransactionById(second.id)).toBeDefined();
    });

    it("exposes account and entity rename operations through the provider", async () => {
      const payeeId = await provider.ensurePayeeExists("Old shop", false, "l1");
      const categoryId = await provider.ensureCategoryExists("Meals", "l1");
      const subCategoryId = await provider.ensureSubCategoryExists(
        "Lunch",
        categoryId!,
        "l1",
      );
      const transaction = await provider.addTransaction({
        user_id: "l1",
        date: "2026-01-01",
        amount: -8,
        currency: "USD",
        account: "Checking",
        vendor: "Old shop",
        category: "Meals",
        sub_category: "Lunch",
      });

      await provider.renamePayee("l1", payeeId!, "New shop");
      await provider.renameCategory("l1", categoryId!, "Dining");
      await provider.renameSubCategory(
        "l1",
        categoryId!,
        subCategoryId!,
        "Brunch",
      );
      const updated = await provider.getTransactionById(transaction.id);
      expect(updated).toMatchObject({
        vendor: "New shop",
        category: "Dining",
        sub_category: "Brunch",
      });
    });

    it("preserves distinct payee update and rename propagation behavior", async () => {
      const vendorId = await provider.ensurePayeeExists(
        "Old name",
        false,
        "l1",
      );
      const transaction = await provider.addTransaction({
        user_id: "l1",
        date: "2026-01-01",
        amount: -4,
        currency: "USD",
        account: "Checking",
        vendor: "Old name",
        category: "Food",
      });

      await provider.updateVendorName(vendorId!, "Record-only name");
      expect(await provider.getTransactionById(transaction.id)).toMatchObject({
        vendor: "Old name",
      });

      const accountVendorId = await provider.ensurePayeeExists(
        "Old account",
        true,
        "l1",
        { currency: "USD" },
      );
      const accountTransaction = await provider.addTransaction({
        user_id: "l1",
        date: "2026-01-02",
        amount: -3,
        currency: "USD",
        account: "Old account",
        vendor: "Market",
        category: "Food",
      });
      const accountVendor = await provider.getVendorById(accountVendorId!);

      await provider.updatePayeeDetails(accountVendorId!, {
        name: "New account",
        currency: "CAD",
        startingBalance: 20,
        remarks: "Main account",
        type: "Savings",
      });

      expect(
        await provider.getAccountById(accountVendor!.account_id!),
      ).toMatchObject({
        currency: "CAD",
        starting_balance: 20,
        type: "Savings",
      });
      expect(
        await provider.getTransactionById(accountTransaction.id),
      ).toMatchObject({
        account: "New account",
        currency: "CAD",
      });
    });

    it("supports account currency propagation and legacy sub-category mutations", async () => {
      const categoryId = await provider.ensureCategoryExists("Food", "l1");
      const subCategoryId = await provider.ensureSubCategoryExists(
        "Produce",
        categoryId!,
        "l1",
      );
      const transaction = await provider.addTransaction({
        user_id: "l1",
        date: "2026-01-01",
        amount: -2,
        currency: "USD",
        account: "Checking",
        vendor: "Shop",
        category: "Food",
        sub_category: "Produce",
      });

      await provider.updateSubCategoryName(
        categoryId!,
        "Food",
        "Produce",
        "Fresh food",
      );
      expect(await provider.getTransactionById(transaction.id)).toMatchObject({
        sub_category: "Fresh food",
      });

      await provider.deleteSubCategoryReferences(
        categoryId!,
        "Food",
        "Fresh food",
      );
      expect(await provider.getTransactionById(transaction.id)).toMatchObject({
        sub_category: null,
      });
      expect(
        (await provider.getSubCategories("l1")).find(
          ({ id }) => id === subCategoryId,
        ),
      ).toBeUndefined();

      const sameNameOtherLedger = await provider.addTransaction({
        user_id: "l2",
        date: "2026-01-01",
        amount: -1,
        currency: "USD",
        account: "Checking",
        vendor: "Shop",
        category: "Food",
      });
      await provider.propagateAccountCurrency("l1", "Checking", "EUR");
      expect(await provider.getTransactionById(transaction.id)).toMatchObject({
        currency: "EUR",
      });
      expect(
        await provider.getTransactionById(sameNameOtherLedger.id),
      ).toMatchObject({
        currency: "USD",
      });
    });

    it("deletes a sub-category and clears its linked names and budgets", async () => {
      const categoryId = await provider.ensureCategoryExists("Food", "l1");
      const subCategoryId = await provider.ensureSubCategoryExists(
        "Dessert",
        categoryId!,
        "l1",
      );
      const transaction = await provider.addTransaction({
        user_id: "l1",
        date: "2026-01-01",
        amount: -6,
        currency: "USD",
        account: "Checking",
        vendor: "Bakery",
        category: "Food",
        sub_category: "Dessert",
      });
      await provider.addBudget({
        user_id: "l1",
        category_id: categoryId!,
        category_name: "Food",
        sub_category_id: subCategoryId,
        sub_category_name: "Dessert",
        target_amount: 20,
        currency: "USD",
        start_date: "2026-01-01",
        end_date: null,
        frequency: "Monthly",
      });

      await provider.deleteSubCategory("l1", categoryId!, subCategoryId!);

      expect(await provider.getTransactionById(transaction.id)).toMatchObject({
        sub_category: null,
      });
      expect(await provider.getBudgetsWithSpending("l1")).toHaveLength(0);
      expect(await provider.getSubCategories("l1")).toHaveLength(0);
    });

    it("supports backup configuration CRUD", async () => {
      const backup = {
        id: "backup-1",
        frequency: 60_000,
        isActive: true,
        nextBackup: "2026-01-01T00:00:00.000Z",
      };
      await provider.addBackupConfig(backup);
      expect(await provider.getBackupConfig(backup.id)).toEqual(backup);
      expect(
        await provider.getDueBackupConfigs("2026-01-01T00:00:00.000Z"),
      ).toEqual([backup]);

      await provider.updateBackupConfig(backup.id, { isActive: false });
      expect(await provider.getBackupConfig(backup.id)).toMatchObject({
        isActive: false,
      });
      await provider.deleteBackupConfig(backup.id);
      expect(await provider.getBackupConfig(backup.id)).toBeUndefined();
    });

    it("supports scheduled transaction lookups and account updates", async () => {
      const vendorId = await provider.ensurePayeeExists(
        "Checking",
        true,
        "l1",
        { currency: "USD" },
      );
      const vendor = await provider.getVendorById(vendorId!);
      const account = await provider.getAccountById(vendor!.account_id!);
      expect(account?.currency).toBe("USD");

      await provider.updateAccount(account!.id, { currency: "CAD" });
      expect(await provider.getAccountById(account!.id)).toMatchObject({
        currency: "CAD",
      });

      const scheduled = await provider.addScheduledTransaction({
        user_id: "l1",
        date: "2026-01-01",
        amount: -10,
        currency: "CAD",
        account: "Checking",
        vendor: "Shop",
        category: "Food",
        frequency: "Monthly",
      });
      expect(await provider.getScheduledTransactionById(scheduled.id)).toEqual(
        scheduled,
      );
    });

    it("round-trips exported data through import", async () => {
      const ledger = await provider.addLedger({
        name: "Archive",
        currency: "EUR",
      });
      const created = await provider.addTransaction({
        user_id: ledger.id,
        date: "2026-02-01",
        amount: -19,
        currency: "EUR",
        account: "Current",
        vendor: "Bakery",
        category: "Food",
      });
      const backup = await provider.exportData();

      await provider.clearAllData();
      await provider.importData(backup);

      expect(await provider.getLedgers()).toHaveLength(1);
      expect(await provider.getTransactionById(created.id)).toMatchObject({
        id: created.id,
        vendor: "Bakery",
        user_id: ledger.id,
      });
    });
  });
};
