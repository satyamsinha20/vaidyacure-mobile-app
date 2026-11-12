"use client";

import React from "react";
import { AiAuditEntry } from "@/services/aiDoctor.service";

export default function ActivityTab({ entries }: { entries: AiAuditEntry[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left font-bold px-3 py-2">When</th>
            <th className="text-left font-bold px-3 py-2">Admin</th>
            <th className="text-left font-bold px-3 py-2">Action</th>
            <th className="text-left font-bold px-3 py-2">Target</th>
            <th className="text-left font-bold px-3 py-2">Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                No changes recorded yet.
              </td>
            </tr>
          )}
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-gray-100 align-top">
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
              <td className="px-3 py-2 text-gray-700">{e.adminEmail}</td>
              <td className="px-3 py-2 font-mono text-gray-800">{e.action}</td>
              <td className="px-3 py-2 text-gray-700">{e.target}</td>
              <td className="px-3 py-2 text-gray-500 max-w-[320px] break-words">{e.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
