import {encode, decode, createCodec} from 'msgpack-lite'

export type encodedBuffer = any // Buffer | Uint8Array | number[] | object

// Codec accept a function or, an array of fuctions to extension {,un}packers.
interface Codec {
    addExtPacker<T>(
        etype: number,
        Class: new(...args: any[]) => T,
        packer: ((t: T) => encodedBuffer) | ((t: T) => encodedBuffer)[]): void;
    addExtUnpacker<T>(
    	etype: number,
		unpacker: ((data: encodedBuffer) => T) | ((data: encodedBuffer) => T)[]): void;
}

const codec: Codec = createCodec({preset: true})
const errorMap = new Map([
	[0x0E, Error],
	[0x01, EvalError],
	[0x02, RangeError],
	[0x03, ReferenceError],
	[0x04, SyntaxError],
	[0x05, TypeError],
	[0x06, URIError],
])

// Override codecs for Maps and Errors
register(0x1C, Map, map => [...map], entries => new Map(entries))
register(0x07, Set, set => [...set], entries => new Set(entries))
for(const [code, errType] of errorMap)
	registerError(code, errType)

/**
 * Pack data into a smaller format.
 */
export const pack = (data: any) => <encodedBuffer>encode(data, {codec})

/**
 * Unpack data into a useable format.
 */
export const unpack = (data: encodedBuffer) => decode(data, {codec})

/**
 * Register an Extension type in the message pack codec
 *
 * @param code should be an integer within the range of 0 and 127
 *  List of current ones: https://github.com/kawanet/msgpack-lite#extension-types
 * @param cls Class to be encoded
 * @param packer Convert instance of cls into an object that can be packed
 * @param unpacker Convert a buffer into an instance of cls
 */
export function register<encInst, buff>(
	code: number,
	cls: new(...args: any[]) => encInst,
	packer: (encinst: encInst) => encodedBuffer,
	unpacker: (buff: encodedBuffer) => encInst,
) {
	codec.addExtPacker(code, cls, [packer, (x: any) => encode(x, {codec})])
	codec.addExtUnpacker(code, [(x: any) => decode(x, {codec}), unpacker])
}

/**
 * Register an Error as an Extension type.
 * @param code
 * @param cls
 */
export function registerError<T extends Error>(
	code: number,
	cls: {new(message: string): T}
) {
	return register(code, cls, function (err) {
		const obj = Object.assign({}, err)
		obj.message = err.message
		return obj
	}, function (errData) {
		const error = new cls(errData.message) as any

		for (const key of Object.keys(errData))
			error[key] = errData[key]

		return error
	})
}
