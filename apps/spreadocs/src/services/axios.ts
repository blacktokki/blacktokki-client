import axios, { AxiosRequestConfig } from 'axios';
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

_axios.interceptors.request.use(
    config => {
        return config;
    },
    error => {
        return Promise.reject(error);
    }
)

_axios.interceptors.response.use(
    response => {
        // if((response.request.responseURL as string).indexOf('/task/login')>=0 && response.data.length != 0){
        //     // redirect login
        // }
        return response;
    },
    error => {
        if (error.response.status === 401) {
            return getToken().then(async(token)=>{
                if (token){
                    const r = await account.post("/api/v1/user/sso/refresh/", {token}, {headers:{'Authorization':''}})
                    if (r.status == 200 && r.data !== ''){
                        setToken(r.data)
                    }
                }
            }).finally(()=>{
                return Promise.reject(error)
            })
        }
        return Promise.reject(error)
    }
)

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