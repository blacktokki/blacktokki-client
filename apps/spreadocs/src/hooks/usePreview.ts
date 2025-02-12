import { useQuery } from "react-query";
import { previewFeed, previewScrap } from "../services/spreadocs";
import { ScrapPreview, FeedPreview } from "../types";
import { useEffect, useState } from "react";

let _cache:Record<string, string> = {}

const callback = async(type:(ScrapPreview|FeedPreview)['type'], query:string)=> {
  try {
    new URL(query)
  }
  catch (_){
    return undefined;
  }
  if (_cache[query]){
    return { description : _cache[query] }
  }
  else{
    const preview = type==='FEED'?await previewFeed({query}):await previewScrap({query})
    if (preview){
      const description = `<div class="scrap mceNonEditable" style="border:1px solid #ddd; padding:10px; display:flex; align-items:center;">
          ${preview.type==='SCRAP' && preview.imageUrl!==undefined?`<img src="${preview.imageUrl}" alt="preview" style="width:80px; height:80px; margin-right:10px;">`:''}
          <div>
            <strong>${preview.title}</strong><br>
            <a href="${query}" target="_blank">${query}</a>
            <p>${preview.description}</p>
          </div>
        </div><p></p>`
        _cache[query] = description
        return { description };
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
