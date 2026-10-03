import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

const BACKGROUND = "#0c1520";

/**
 * App icon from the brand symbol (125×144, too small to ship as-is): centered on the brand
 * background. `safeArea` keeps it inside the maskable safe zone (80 % circle) for Android.
 */
export async function brandIcon(size: number, safeArea = false) {
  const symbol = await readFile(join(process.cwd(), "public/brand/bellomo/symbol.png"));
  const height = Math.round(size * (safeArea ? 0.5 : 0.62));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BACKGROUND }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img */}
        <img src={`data:image/png;base64,${symbol.toString("base64")}`} height={height} width={Math.round((height * 125) / 144)} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
