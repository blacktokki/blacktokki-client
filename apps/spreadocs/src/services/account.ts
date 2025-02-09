import { AccountService, User } from "@blacktokki/account";
import { getToken, setToken, account } from "./axios";


const checkLoginToken = async ()=>{
    const value = (await account.get("/api/v1/user/?self=true"))?.data?.value
    if (value){
        return value[0] as User
    }
    return null
}


export const accountService:AccountService = {
  checkLogin: async function () {
    const token = await getToken()
    if (token === null)
        return null
    try{
       return await checkLoginToken()
    }
    catch(e:any){
        let error = e
        try{
            return await checkLoginToken()
        }
        catch(e2){
            error = e2
        }
        const isOffline = ((error as any).code == "ERR_NETWORK" || (error as any).message && ((error as any).message as string).startsWith("Cannot read"))
        throw {error, isOffline}
    }
  },
  login: async function (username, password) {
    if(username.endsWith('.guest') && password.length == 0)
        password = 'guest'
    const formData = new FormData();
    formData.append("username", username);
    formData.append("password", password);
    const r = await account.post("/login", formData);
    const token:string = r.headers['authorization']
    if(r.status == 200 && token){
        await setToken(token.split(' ')[1])
        return await accountService.checkLogin()
    }
  },
  logout: function (): Promise<any> {
    throw new Error('Function not implemented.');
  }
}