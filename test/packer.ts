import 'should'
import {pack, registerError, unpack} from '../src/Packer'

describe('Packer', () => {
    it('Complex', function () {
        const data = {
            'int': 1,
            'float': 0.5,
            'boolean': true,
            'null': null,
            'string': 'foo bar',
            'array': [
                'foo',
                'bar',
            ],
            'inner': {
                'object': {
                    'foo': 1,
                    'baz': 0.5,
                },
                'map': new Map([
                    ['hello', 'world'],
                    ['1', '12345'],
                ]),
                'set': new Set([
                    'hello',
                    'world',
                    '1',
                    '12345',
                ]),
            },
        }

        const actual = unpack(pack(data))

        actual.should.eql(data)
    })

    it('Errors', function () {
        class PootError extends Error {
        }

        registerError(0xFF, PootError)

        const error = <any>new PootError('pootis')
        error.columnNumber = 6
        error.more = true
        error.type = 'extra'

        const actual = unpack(pack(error))

        actual.should.be.an.Error()
        actual.should.eql(error)
    })
})
