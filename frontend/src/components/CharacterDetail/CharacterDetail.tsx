import { useMapCharacterDetail } from "../../hooks/useMap";
import { buildingTypeLabel } from "../Map/geojson";
import List from "../List/List";
import styles from "./CharacterDetail.module.scss";

interface CharacterDetailProps {
  characterId: number;
}

export default function CharacterDetail({ characterId }: CharacterDetailProps) {
  const { data, isLoading, isError } = useMapCharacterDetail(characterId);

  if (isLoading) {
    return <p className={styles.status}>Loading...</p>;
  }

  if (isError || !data) {
    return <p className={styles.status}>Couldn&apos;t load this character.</p>;
  }

  // "walking" overrides the scheduled activity while moving, same rule as
  // the character's own map tooltip (CharacterTooltipContent).
  const activityLabel = data.is_moving ? "walking" : data.current_activity;
  const home = data.home_type ? buildingTypeLabel(data.home_type) : null;
  const work = data.work_type ? buildingTypeLabel(data.work_type) : null;

  // List's generic constraint needs an `id` field - reuse character_id
  // rather than widen the item type with an index signature.
  type RelationshipListItem = (typeof data.relationships)[number] & {
    id: number;
  };
  const relationshipItems: RelationshipListItem[] = data.relationships.map(
    (relationship) => ({ ...relationship, id: relationship.character_id })
  );

  return (
    <div className={styles.root}>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Age</dt>
          <dd>
            {data.age}, {data.sex}
          </dd>
        </div>
        {activityLabel && (
          <div className={styles.fact}>
            <dt>Currently</dt>
            <dd>{activityLabel}</dd>
          </div>
        )}
        {home && (
          <div className={styles.fact}>
            <dt>Home</dt>
            <dd>{home}</dd>
          </div>
        )}
        {work && (
          <div className={styles.fact}>
            <dt>Work</dt>
            <dd>{work}</dd>
          </div>
        )}
      </dl>

      {data.relationships.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Relationships</h3>
          <List<RelationshipListItem>
            items={relationshipItems}
            className={styles.relationshipsList}
            renderItem={(relationship) => (
              <span>
                {relationship.name} — {relationship.label}
              </span>
            )}
          />
        </section>
      )}
    </div>
  );
}
