import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://blacktokki.com'
const accountURL =  `${API_URL}/account/`
export const baseURL = `${API_URL}/spreadocs/`

const defaultOption:AxiosRequestConfig = {
    baseURL,
    withCredentials: true,
    headers: {}
};
const _axios = axios.create(defaultOption);
export const account = axios.create({...defaultOption, baseURL:accountURL})


const needRefresh = (response:AxiosResponse<any, any>) => {
    return response.config.url == '/api/v1/user/?self=true' && response.request.responseURL.endsWith("account/login") || response.status === 401
}

const refreshToken = async()=>{
    return getToken().then(async(token)=>{
        if (token){
            const r = await account.post("/api/v1/user/sso/refresh/", {token}, {headers:{'Authorization':''}})
            if (r.status == 200 && r.data !== ''){
                await setToken(r.data)
            }
        }
    })
}

const responseInterceptor = async(response:AxiosResponse<any, any>) => {
    if (needRefresh(response)){
        await refreshToken();
        throw { response };
    }
    return response;
}

const responseErrorInterceptor = async (error:any) => {
    if (needRefresh(error.response)) {
        await refreshToken()
    }
    return Promise.reject(error)
}

_axios.interceptors.response.use(responseInterceptor, responseErrorInterceptor)
account.interceptors.response.use(responseInterceptor, responseErrorInterceptor)


export const setToken = async (token:string|null)=>{
    _axios.defaults.headers['Authorization'] = `JWT ${token}`
    account.defaults.headers['Authorization'] = _axios.defaults.headers['Authorization']
    if (token)
        await AsyncStorage.setItem("Authorization", token)
    else
        AsyncStorage.removeItem("Authorization")
}
export const getToken = async ()=>{
    const token = await AsyncStorage.getItem("Authorization")
    _axios.defaults.headers['Authorization'] = token?`JWT ${token}`:null
    account.defaults.headers['Authorization'] = _axios.defaults.headers['Authorization']
    return token
}

export default _axios