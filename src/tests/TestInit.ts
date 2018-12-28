import {expect} from "chai";
import * as mocha from "mocha";

class TesterInit {

    constructor() {
        describe("init", () => {
            it("should pass", () => {
                expect(1 + 1).to.equal(3);
            });
        });
    }
}

new TesterInit();
