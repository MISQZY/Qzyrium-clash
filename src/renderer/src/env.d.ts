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
declare module '*.png' {
  const url: string
  export default url
}
