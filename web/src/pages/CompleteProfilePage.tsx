import { Loader2, Leaf } from "lucide-react";
import { useState, type FormEvent } from "react";
import { LocationFields } from "../components/auth/LocationFields";
import { api } from "../lib/api";
import type { PublicUser } from "@govi/shared";

type Props = {
  onDone?: (user: PublicUser) => void;
};

/** First-time Google signup only — collect district / role / phone. */
export default function CompleteProfilePage({ onDone }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const existing = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();

  const [form, setForm] = useState({
    fullName: existing?.fullName || "",
    phone: existing?.phone || "",
    district: existing?.district || "",
    dsDivision: existing?.dsDivision || "",
    gnDivision: existing?.gnDivision || "",
    role: existing?.role || "farmer",
    officerId: "",
    department: "",
    designation: "",
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{ token: string; user: PublicUser }>(
        "/api/auth/complete-profile",
        { method: "POST", body: JSON.stringify(form) }
      );
      localStorage.setItem("token", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      onDone?.(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center text-white">
        <Leaf className="h-16 w-16 text-green-300 mx-auto mb-2" />
        <h1 className="text-4xl font-black tracking-tighter">GOVI ISURU</h1>
        <p className="mt-2 text-green-100 text-sm">
          One more step — tell us where you farm
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl space-y-3"
      >
        <input
          className="w-full rounded-2xl border-2 border-gray-200 px-4 py-3 outline-none focus:border-green-500"
          placeholder="Full name"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          required
        />
        <input
          className="w-full rounded-2xl border-2 border-gray-200 px-4 py-3 outline-none focus:border-green-500"
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <select
          className="w-full rounded-2xl border-2 border-gray-200 px-4 py-3 outline-none focus:border-green-500"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="farmer">Farmer</option>
          <option value="buyer">Buyer</option>
          <option value="officer">Agricultural Instructor</option>
        </select>
        {form.role === "officer" && (
          <input
            className="w-full rounded-2xl border-2 border-gray-200 px-4 py-3 outline-none focus:border-green-500"
            placeholder="Officer ID"
            value={form.officerId}
            onChange={(e) => setForm({ ...form, officerId: e.target.value })}
            required
          />
        )}
        <LocationFields
          district={form.district}
          dsDivision={form.dsDivision}
          gnDivision={form.gnDivision}
          onChange={(next) => setForm({ ...form, ...next })}
        />
        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 py-3.5 font-bold text-white disabled:opacity-70"
        >
          {loading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          ) : (
            "Save and continue"
          )}
        </button>
      </form>
    </div>
  );
}

export { CompleteProfilePage };
