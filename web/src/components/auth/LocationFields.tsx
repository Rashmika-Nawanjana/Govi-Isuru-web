import { useMemo } from "react";
import { administrativeData } from "../../data/sriLankaData";

type Props = {
  district: string;
  dsDivision: string;
  gnDivision: string;
  onChange: (next: {
    district?: string;
    dsDivision?: string;
    gnDivision?: string;
  }) => void;
};

export function LocationFields({
  district,
  dsDivision,
  gnDivision,
  onChange,
}: Props) {
  const districts = useMemo(() => Object.keys(administrativeData), []);
  const dsDivisions = useMemo(
    () => (district ? Object.keys(administrativeData[district] || {}) : []),
    [district]
  );
  const gnDivisions = useMemo(
    () =>
      district && dsDivision
        ? administrativeData[district]?.[dsDivision] || []
        : [],
    [district, dsDivision]
  );

  return (
    <div className="grid gap-3">
      <select
        className="w-full rounded-2xl border-2 border-gray-200 px-4 py-3 outline-none focus:border-green-500"
        value={district}
        onChange={(e) =>
          onChange({
            district: e.target.value,
            dsDivision: "",
            gnDivision: "",
          })
        }
        required
      >
        <option value="">District</option>
        {districts.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        className="w-full rounded-2xl border-2 border-gray-200 px-4 py-3 outline-none focus:border-green-500"
        value={dsDivision}
        onChange={(e) =>
          onChange({ dsDivision: e.target.value, gnDivision: "" })
        }
        required
        disabled={!district}
      >
        <option value="">DS Division</option>
        {dsDivisions.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        className="w-full rounded-2xl border-2 border-gray-200 px-4 py-3 outline-none focus:border-green-500"
        value={gnDivision}
        onChange={(e) => onChange({ gnDivision: e.target.value })}
        required
        disabled={!dsDivision}
      >
        <option value="">GN Division</option>
        {gnDivisions.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );
}
