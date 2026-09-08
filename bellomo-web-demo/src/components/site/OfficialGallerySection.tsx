"use client";
import { useOfficialData, CmsLink } from "../OfficialCms";
import { SiteText } from "../WebsiteProvider";
import { CmsImage as Image } from "../OfficialCms";
import type { BellomoImage, OfficialMediaCollection } from "@/data/bellomo";
import { ArrowIcon, Media, SectionHeading } from "./shared";

const categories: {
  id: OfficialMediaCollection["category"];
  description: string;
}[] = [
  {
    id: "Loteos",
    description:
      "Paisajes, vistas aéreas, aperturas de calles y evolución real de los desarrollos.",
  },
  {
    id: "Arquitectura",
    description:
      "Obras terminadas y visualizaciones comerciales identificadas de forma explícita.",
  },
  {
    id: "Trayectoria",
    description:
      "Archivo institucional que documenta la continuidad familiar de Bellomo.",
  },
];

function GalleryImage({ image }: { image: BellomoImage }) {


  const fit = image.fit ?? (image.kind === "Render" ? "contain" : "cover");

  return (
    <figure className={`official-gallery-image is-${fit}`}>
      <Image
        alt={image.alt}
        fill
        loading="lazy"
        sizes="(max-width: 680px) 100vw, (max-width: 1100px) 50vw, 33vw"
        src={image.src}
        style={{ objectPosition: image.position }}
      />
      <figcaption>
        <span>{image.kind ?? "Fotografía"}</span>
        <p>{image.alt}</p>
        <small>{image.source}</small>
        <CmsLink href={image.src} rel="noopener noreferrer" target="_blank">
          <SiteText id="rami-text-51"/><ArrowIcon />
        </CmsLink>
      </figcaption>
    </figure>
  );
}

function GalleryCollection({
  collection,
  open,
}: {
  collection: OfficialMediaCollection;
  open: boolean;
}) {


  return (
    <details className="official-gallery-collection" data-reveal open={open}>
      <summary>
        <Media
          className="official-gallery-cover"
          media={collection.images[0]}
          sizes="(max-width: 680px) 100vw, 220px"
        />
        <span className="official-gallery-summary-copy">
          <small>{collection.category}</small>
          <strong>{collection.title}</strong>
          <span>{collection.description}</span>
        </span>
        <span className="official-gallery-count">
          {collection.images.length} {collection.images.length === 1 ? "pieza" : "piezas"}
        </span>
        <ArrowIcon />
      </summary>
      <div className="official-gallery-grid">
        {collection.images.map((image) => (
          <GalleryImage image={image} key={image.src} />
        ))}
      </div>
    </details>
  );
}

export function OfficialGallerySection() {
  const { officialMediaCollections } = useOfficialData();

  return (
    <section className="section official-gallery-section" id="archivo">
      <div className="section-shell">
        <SectionHeading
          eyebrow={<SiteText id="rami-text-52"/>}
          light
          title={<SiteText id="rami-text-53"/>}
        >
          <p>
            <SiteText id="rami-text-54"/></p>
        </SectionHeading>

        <aside className="official-gallery-note" data-reveal>
          <strong><SiteText id="rami-text-55"/></strong>
          <p>
            <SiteText id="rami-text-56"/></p>
        </aside>

        <div className="official-gallery-categories">
          {categories.map((category) => {
            const collections = officialMediaCollections.filter(
              (collection) => collection.category === category.id,
            );

            return (
              <div className="official-gallery-category" key={category.id}>
                <header data-reveal>
                  <p><SiteText id="rami-text-57"/>{category.id}</p>
                  <span>{category.description}</span>
                </header>
                <div className="official-gallery-list">
                  {collections.map((collection, index) => (
                    <GalleryCollection
                      collection={collection}
                      key={collection.id}
                      open={category.id === "Loteos" && index === 0}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
