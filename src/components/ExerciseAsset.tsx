"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import type { ReviewAsset, ReviewAssetRegion } from "@/src/lib/review/types";

function validRegion(region: ReviewAssetRegion | undefined): region is ReviewAssetRegion {
  if (!region) return false;
  return (
    Number.isFinite(region.x) &&
    Number.isFinite(region.y) &&
    Number.isFinite(region.width) &&
    Number.isFinite(region.height) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.width > 0 &&
    region.height > 0 &&
    region.x + region.width <= 1 &&
    region.y + region.height <= 1
  );
}

export default function ExerciseAsset({ asset }: { asset: ReviewAsset }) {
  const width = Math.max(1, Math.round(asset.width ?? 1200));
  const height = Math.max(1, Math.round(asset.height ?? 800));
  const region = validRegion(asset.region) ? asset.region : undefined;
  const crop = asset.presentation === "crop" && region;

  const cropViewport: CSSProperties | undefined = crop
    ? { aspectRatio: `${region.width * width} / ${region.height * height}` }
    : undefined;
  const cropImage: CSSProperties | undefined = crop
    ? {
        width: `${100 / region.width}%`,
        height: "auto",
        maxWidth: "none",
        left: `${-(region.x / region.width) * 100}%`,
        top: `${-(region.y / region.height) * 100}%`,
      }
    : undefined;

  return (
    <figure className={`exercise-asset ${crop ? "is-crop" : "is-full"}`}>
      <div className="exercise-asset-viewport" style={cropViewport}>
        {crop ? (
          <Image
            className="exercise-asset-image crop-image"
            src={asset.src}
            alt={asset.alt}
            width={width}
            height={height}
            sizes="(max-width: 680px) 92vw, 520px"
            style={cropImage}
            unoptimized
          />
        ) : (
          <Image
            className="exercise-asset-image"
            src={asset.src}
            alt={asset.alt}
            width={width}
            height={height}
            sizes="(max-width: 680px) 92vw, 520px"
            unoptimized
          />
        )}
      </div>
      {(asset.caption || asset.attribution || asset.license) && (
        <figcaption>
          {asset.caption && <span>{asset.caption}</span>}
          {(asset.attribution || asset.license) && (
            <small>
              {asset.sourceUrl && asset.attribution ? (
                <a href={asset.sourceUrl} target="_blank" rel="noreferrer">{asset.attribution}</a>
              ) : (
                asset.attribution
              )}
              {asset.attribution && asset.license ? " · " : ""}
              {asset.license}
            </small>
          )}
        </figcaption>
      )}
    </figure>
  );
}
