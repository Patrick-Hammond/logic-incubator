import { EaseSegment, SimpleEase } from './ParticleUtils';
import { ValueList } from './PropertyNode';
import { BasicPoint } from './PolygonalChain';

/**
 * An area in the stage's (global) coordinates: particles that have one live until they leave it instead of dying of age - see
 * `Emitter.killRect`.
 */
export interface KillRectConfig {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface EmitterConfig {
	/**
	 * If set, particles no longer die of age: `lifetime` only says how long their alpha, scale, colour and speed take to reach their
	 * end values, which they then hold, and each particle lives until its centre leaves this area, in the stage's (global) coordinates.
	 * Make it bigger than the screen to let particles drift in from outside it.
	 */
	killRect?: KillRectConfig;
	alpha?: ValueList<number>;
	speed?: ValueList<number>;
	minimumSpeedMultiplier?: number;
	maxSpeed?: number;
	acceleration?: {x: number; y: number};
	scale?: ValueList<number>;
	minimumScaleMultiplier?: number;
	color?: ValueList<string>;
	startRotation?: RandNumber;
	noRotation?: boolean;
	rotationSpeed?: RandNumber;
	rotationAcceleration?: number;
	lifetime: RandNumber;
	blendMode?: string;
	ease?: SimpleEase | EaseSegment[];
	extraData?: any;
	particlesPerWave?: number;
	/**
	 * Really "rect"|"circle"|"ring"|"burst"|"point"|"polygonalChain", but that
	 * tends to be too strict for random object creation.
	 */
	spawnType?: string;
	spawnRect?: {x: number; y: number; w: number; h: number};
	spawnCircle?: {x: number; y: number; r: number; minR?: number};
	particleSpacing?: number;
	angleStart?: number;
	spawnPolygon?: BasicPoint[] | BasicPoint[][];
	frequency: number;
	spawnChance?: number;
	emitterLifetime?: number;
	maxParticles?: number;
	addAtBack?: boolean;
	pos: {x: number; y: number};
	emit?: boolean;
	autoUpdate?: boolean;
	orderedArt?: boolean;
}

export interface RandNumber {
	max: number;
	min: number;
}

export interface BasicTweenable<T> {
	start: T;
	end: T;
}

export interface OldEmitterConfig {
	/** See `EmitterConfig.killRect`. */
	killRect?: KillRectConfig;
	alpha?: BasicTweenable<number>;
	speed?: BasicTweenable<number> & {minimumSpeedMultiplier?: number};
	maxSpeed?: number;
	acceleration?: {x: number; y: number};
	scale?: BasicTweenable<number> & {minimumScaleMultiplier?: number};
	color?: BasicTweenable<string>;
	startRotation?: RandNumber;
	noRotation?: boolean;
	rotationSpeed?: RandNumber;
	rotationAcceleration?: number;
	lifetime: RandNumber;
	blendMode?: string;
	ease?: SimpleEase | EaseSegment[];
	extraData?: any;
	particlesPerWave?: number;
	/**
	 * Really "rect"|"circle"|"ring"|"burst"|"point"|"polygonalChain", but that
	 * tends to be too strict for random object creation.
	 */
	spawnType?: string;
	spawnRect?: {x: number; y: number; w: number; h: number};
	spawnCircle?: {x: number; y: number; r: number; minR?: number};
	particleSpacing?: number;
	angleStart?: number;
	spawnPolygon?: BasicPoint[] | BasicPoint[][];
	frequency: number;
	spawnChance?: number;
	emitterLifetime?: number;
	maxParticles?: number;
	addAtBack?: boolean;
	pos: {x: number; y: number};
	emit?: boolean;
	autoUpdate?: boolean;
	orderedArt?: boolean;
}
