"use client";

import { useEffect, useState } from "react";
import { fetchTables, fetchTableRows, TableInfo, TableData } from "../lib/api";
import { useLang } from "../lib/i18n";

const PAGE = 100;

function cell(value: any): { text: string; dim: boolean } {
  if (value === null || value === undefined) return { text: "null", dim: true };
  if (typeof value === "object") return { text: JSON.stringify(value), dim: false };
  return { text: String(value), dim: false };
}

export default function AdminView() {
  const { t } = useLang();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [data, setData] = useState<TableData | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTables().then((ts) => {
      setTables(ts);
      if (ts.length) setActive((prev) => prev ?? ts[0].name);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    fetchTableRows(active, PAGE, offset).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [active, offset]);

  function selectTable(name: string) {
    setActive(name);
    setOffset(0);
  }

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Table list */}
      <div style={{ width: 240, borderRight: "1px solid var(--border)", background: "var(--panel)", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ padding: "12px 16px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)" }}>
          {t("admin.tables")}
        </div>
        {tables.map((tbl) => (
          <div
            key={tbl.name}
            onClick={() => selectTable(tbl.name)}
            style={{
              padding: "10px 16px", cursor: "pointer",
              borderLeft: tbl.name === active ? "3px solid #1F4E79" : "3px solid transparent",
              background: tbl.name === active ? "var(--panel2)" : "transparent",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "var(--text)" }}>{tbl.name}</span>
            <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--chip-bg)", borderRadius: 999, padding: "1px 8px" }}>{tbl.rows}</span>
          </div>
        ))}
      </div>

      {/* Table contents */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "var(--text)" }}>{active}</div>
          {data && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--muted)" }}>
              <span>{data.total} {t("admin.rows")}</span>
              <button onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={offset === 0}
                style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", cursor: offset === 0 ? "default" : "pointer", opacity: offset === 0 ? 0.5 : 1 }}>
                {t("admin.prev")}
              </button>
              <span>{data.total === 0 ? 0 : offset + 1}–{offset + data.rows.length} {t("admin.of")} {data.total}</span>
              <button onClick={() => setOffset(offset + PAGE)} disabled={offset + PAGE >= data.total}
                style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", cursor: offset + PAGE >= data.total ? "default" : "pointer", opacity: offset + PAGE >= data.total ? 0.5 : 1 }}>
                {t("admin.next")}
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {loading || !data ? (
            <div style={{ padding: 24, color: "var(--muted)" }}>{t("admin.loading")}</div>
          ) : (
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "max-content", minWidth: "100%" }}>
              <thead>
                <tr>
                  {data.columns.map((c) => (
                    <th key={c} style={{ position: "sticky", top: 0, background: "var(--panel2)", color: "var(--text)", textAlign: "left", padding: "8px 12px", borderBottom: "2px solid var(--border)", fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 ? "var(--panel2)" : "var(--panel)" }}>
                    {data.columns.map((c) => {
                      const { text, dim } = cell(row[c]);
                      return (
                        <td key={c} title={text} style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", color: dim ? "var(--muted)" : "var(--text)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace" }}>
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
