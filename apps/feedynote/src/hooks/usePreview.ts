import { useQuery } from "react-query";
import { previewFeed, previewScrap } from "../services/feedynote";
import { ScrapPreview, FeedPreview } from "../types";
import { useEffect, useState } from "react";

let _cache:Record<string, { title:string, description:string }> = {}


export const renderDescription = (preview:{title:string, url:string, description?:string, imageUrl?:string})=>{
  return `<div class="scrap mceNonEditable" style="border:1px solid #ddd; padding:10px; display:flex; align-items:center;">
  ${preview.imageUrl!==undefined?`<img src="${preview.imageUrl}" alt="preview" style="width:80px; height:80px; margin-right:10px;">`:''}
  <div style="word-break:break-word;">
    <strong>${preview.title}</strong><br>
    <a href="${preview.url}" target="_blank">${preview.url}</a>
    ${preview.description ? `<p>${preview.description}</p>`: ""}
  </div>
</div>`
}

const callback = async(type:(ScrapPreview|FeedPreview)['type'], query:string)=> {
  try {
    new URL(query)
  }
  catch (_){
    return undefined;
  }
  if (_cache[query]){
    return _cache[query]
  }
  else{
    const preview = type==='FEED'?await previewFeed({query}):await previewScrap({query})
    if (preview && preview.title !==null){
      const description =  renderDescription({...preview, url:query});
        const _preview = {title:preview.title, description}
        _cache[query] = _preview
        return _preview;
    }
    else {
      return undefined
    }
  }
}

export default <T extends ScrapPreview|FeedPreview>(type:T['type'], query?:string)=>{
  const [_query, setQuery] = useState<string>()
  const { data } = useQuery(["Preview", type, _query] , async()=> _query?await callback(type, _query):undefined)

  useEffect(()=>{
    const timeout = setTimeout(()=>setQuery(query), 320)
    return () => clearTimeout(timeout)
  }, [query])
  return data
};;
