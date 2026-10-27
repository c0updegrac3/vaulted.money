import {
  DataProviderConflictError,
  type Category,
  type DataProvider,
  type SubCategory,
  type Vendor,
} from "@/types/dataProvider";
import { conflict } from "./http";

const translateConflict = async (operation: () => Promise<void>) => {
  try {
    await operation();
  } catch (error) {
    if (error instanceof DataProviderConflictError) {
      throw conflict(error.message);
    }
    throw error;
  }
};

export async function renamePayee(
  dataProvider: DataProvider,
  ledgerId: string,
  vendor: Vendor,
  newName: string,
): Promise<void> {
  await translateConflict(() =>
    dataProvider.renamePayee(ledgerId, vendor.id, newName),
  );
}

export async function propagateAccountCurrency(
  dataProvider: DataProvider,
  ledgerId: string,
  accountName: string,
  currency: string,
): Promise<void> {
  await dataProvider.propagateAccountCurrency(ledgerId, accountName, currency);
}

export async function renameCategory(
  dataProvider: DataProvider,
  ledgerId: string,
  category: Category,
  newName: string,
): Promise<void> {
  await translateConflict(() =>
    dataProvider.renameCategory(ledgerId, category.id, newName),
  );
}

export async function renameSubCategory(
  dataProvider: DataProvider,
  ledgerId: string,
  parent: Category,
  sub: SubCategory,
  newName: string,
): Promise<void> {
  await translateConflict(() =>
    dataProvider.renameSubCategory(ledgerId, parent.id, sub.id, newName),
  );
}

export async function deleteSubCategory(
  dataProvider: DataProvider,
  ledgerId: string,
  parent: Category,
  sub: SubCategory,
): Promise<void> {
  await dataProvider.deleteSubCategory(ledgerId, parent.id, sub.id);
}
