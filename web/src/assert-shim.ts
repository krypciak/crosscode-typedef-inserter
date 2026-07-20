function assert(value: any, msg?: string) {
    if (!value) {
        throw new Error('assertion failed' + (msg ? ': ' + msg : ''))
    }
}
export default assert
export { assert }
