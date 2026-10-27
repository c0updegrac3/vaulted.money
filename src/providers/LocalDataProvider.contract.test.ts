import "fake-indexeddb/auto";
import { db } from "@/lib/dexieDB";
import { LocalDataProvider } from "./LocalDataProvider";
import { defineDataProviderContract } from "./dataProviderContract";

const resetDatabase = async () => {
  await db.open();
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
};

defineDataProviderContract(() => new LocalDataProvider(), resetDatabase);
