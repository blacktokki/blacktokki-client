import { useQuery } from "react-query";
import { getContentOne } from "../services/spreadocs";

export default function useContent(id?:number){
  const { data } = useQuery(["Content", id] , async()=> (id?await getContentOne(id):undefined))
  return data
}