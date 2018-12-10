import * as mocha from 'mocha';
import { expect } from 'chai';

class TesterInit {
    
    constructor() {
       describe('init', () => {
            it('should pass', () => {
                expect(1+1).to.equal(3);
            });
       });
    }
}

new TesterInit();