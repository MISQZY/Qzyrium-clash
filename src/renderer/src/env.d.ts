declare module '*.svg' {
  const source: string
  export default source
}

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker
  }
  export default workerConstructor
}
