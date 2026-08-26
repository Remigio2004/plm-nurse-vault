import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { mockRecords, type StudentRecord } from "@/data/records";

interface VaultContextValue {
  records: StudentRecord[];
  addRecord: (record: Omit<StudentRecord, "id" | "uploadDate">) => void;
  removeRecord: (id: string) => void;
  renameRecord: (id: string, fileName: string) => void;
  search: string;
  setSearch: (value: string) => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<StudentRecord[]>(mockRecords);
  const [search, setSearch] = useState("");

  const value = useMemo<VaultContextValue>(
    () => ({
      records,
      search,
      setSearch,
      addRecord: (record) =>
        setRecords((prev) => [
          {
            ...record,
            id: `r-${Date.now()}`,
            uploadDate: new Date().toISOString().slice(0, 10),
          },
          ...prev,
        ]),
      removeRecord: (id) => setRecords((prev) => prev.filter((r) => r.id !== id)),
      renameRecord: (id, fileName) =>
        setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, fileName } : r))),
    }),
    [records, search],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}
