// Structured tooltip content for building/character map markers, kept out
// of Map.tsx since the trigger elements (polygons/glyphs) already carry a
// lot of pan/zoom/rendering logic.

interface GoodEntry {
  good_type?: string;
  display?: string;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

interface BuildingTooltipProps {
  label: string;
  buildingType?: string;
  workers?: number | null;
  residents?: number | null;
  goods?: GoodEntry[] | null;
}

export function BuildingTooltipContent({
  label,
  buildingType,
  workers,
  residents,
  goods,
}: BuildingTooltipProps) {
  const stockedGoods = (goods ?? []).filter((g) => g.display);
  const isResidential = buildingType === "residential";
  const occupancyCount = isResidential ? residents : workers;
  const occupancyLabel = isResidential ? "Residents" : "Workers";
  return (
    <div>
      <div>{label}</div>
      {occupancyCount !== null && occupancyCount !== undefined && (
        <div>
          {occupancyLabel}: {occupancyCount}
        </div>
      )}
      {stockedGoods.length > 0 && (
        <>
          <div>Inventory:</div>
          <ul>
            {stockedGoods.map((g, i) => (
              <li key={g.good_type ?? i}>
                {g.good_type ? capitalize(g.good_type) : ""}: {g.display}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

interface CharacterTooltipProps {
  name?: string;
  home?: string | null;
  work?: string | null;
  hungerLabel?: string | null;
}

export function CharacterTooltipContent({ name, home, work, hungerLabel }: CharacterTooltipProps) {
  return (
    <div>
      <div>{name}</div>
      {home && <div>Lives at: {home}</div>}
      {work && <div>Works at: {work}</div>}
      {hungerLabel && <div>{hungerLabel}</div>}
    </div>
  );
}
