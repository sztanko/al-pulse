/** The slice of p5.brush's standalone build this site uses.
 *
 * The package ships no types. Rather than `any` the whole import, this
 * declares exactly the calls the district portrait makes — which doubles as
 * the record of what was checked against the real build, since the published
 * API and the shipped one have already disagreed once here: the docs show
 * `brush.load(canvas)` taking options, and it does not.
 */
declare module 'p5.brush/standalone' {
  /** The brushes this build actually ships, checked against 2.2.2. The
   * published README still lists `hatch_brush` and `marker2`, which do not
   * exist and throw at the first drawing call. */
  type BrushName =
    | 'pen' | 'rotring' | '2B' | 'HB' | '2H' | 'cpencil'
    | 'pastel' | 'crayon' | 'charcoal' | 'spray' | 'marker';

  export const DEGREES: unknown;
  export const RADIANS: unknown;

  /** Creates the canvas and appends it to `parent`. */
  export function createCanvas(
    width: number,
    height: number,
    options?: { parent?: HTMLElement | string; pixelDensity?: number; id?: string }
  ): HTMLCanvasElement;

  export function seed(value: number | string): void;
  export function noiseSeed(value: number | string): void;
  export function angleMode(mode: unknown): void;
  export function scaleBrushes(scale: number): void;

  export function clear(colour?: string): void;
  /** Mandatory: nothing reaches the canvas until this is called. */
  export function render(): void;

  export function push(): void;
  export function pop(): void;

  export function set(brushName: BrushName, colour: string, weight: number): void;
  export function stroke(colour: string): void;
  export function strokeWeight(weight: number): void;
  export function noStroke(): void;

  export function fill(colour: string, opacity?: number): void;
  export function noFill(): void;
  /** How far a fill bleeds past its own edge, and in which direction. */
  export function fillBleed(strength: number, direction?: 'out' | 'in', turbulence?: number): void;
  export function fillTexture(strength?: number, borderAlpha?: number): void;
  /** Flat fill without the watercolour simulation — far cheaper. */
  export function wash(colour: string, opacity?: number): void;
  export function noWash(): void;

  export function hatch(
    distance: number,
    angle: number,
    options?: { rand?: number | false; continuous?: boolean; gradient?: number | false }
  ): void;
  export function hatchStyle(brushName: BrushName, colour: string, weight: number): void;
  export function noHatch(): void;

  export function polygon(points: [number, number][]): void;
  /** `curvature` 0 is a polyline; higher values spline through the vertices. */
  export function beginShape(curvature?: number): void;
  export function vertex(x: number, y: number, pressure?: number): void;
  export function endShape(close?: boolean): void;
}
