import * as shaderGenerator from "./shaderGenerator";
import * as tilemapVertexTemplateSrc from "./tilemap.vert";
import * as tilemapFragmentTemplateSrc from "./tilemap.frag";

import { Buffer, Geometry, Shader, Program, Matrix } from "pixi.js";

export class TilemapShader extends Shader {
    maxTextures = 0;

    constructor(maxTextures: number) {
        super(
            new Program(
                tilemapVertexTemplateSrc,
                shaderGenerator.generateFragmentSrc(maxTextures, tilemapFragmentTemplateSrc)
            ),
            {
                animationFrame: new Float32Array(2),
                uSamplers: [],
                uSamplerSize: [],
                projTransMatrix: new Matrix(),
                tileAlpha: 1,
                time: 0
            }
        );

        this.maxTextures = maxTextures;
        shaderGenerator.fillSamplers(this, this.maxTextures);
    }
}

export class TilemapGeometry extends Geometry {
    vertSize = 18;
    vertPerQuad = 4;
    stride = this.vertSize * 4;
    lastTimeAccess = 0;

    buf: Buffer;

    constructor() {
        super();

        const buf = this.buf = new Buffer(new Float32Array(2), true, false);

        this.addAttribute("aVertexPosition", buf, 0, false, 0, this.stride, 0)
            .addAttribute("aTextureCoord", buf, 0, false, 0, this.stride, 2 * 4)
            .addAttribute("aFrame", buf, 0, false, 0, this.stride, 4 * 4)
            .addAttribute("aAnim", buf, 0, false, 0, this.stride, 8 * 4)
            .addAttribute("aTextureId", buf, 0, false, 0, this.stride, 10 * 4)
            .addAttribute("aAnimDivisor", buf, 0, false, 0, this.stride, 11 * 4)
            .addAttribute("aAlpha", buf, 0, false, 0, this.stride, 12 * 4)
            .addAttribute("aTint", buf, 3, false, 0, this.stride, 13 * 4)
            .addAttribute("aFlicker", buf, 2, false, 0, this.stride, 16 * 4);
    }
}
