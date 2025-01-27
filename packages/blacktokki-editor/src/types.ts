export type EditorProps = {
  theme: 'light'| 'dark',
  value:string, 
  setValue:(v:string)=>void, 
  onReady?:()=>void
}