import axios from "axios";

export class RequestBase {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;

        this.axiosInstance = axios.create({
            baseURL: baseUrl,
        });

        // 请求拦截器
        this.axiosInstance.interceptors.request.use(
            (config) => {
                // 这里可以添加token等通用逻辑
                // config.headers['Authorization'] = 'Bearer ' + token;
                return config;
            },
            (error) => Promise.reject(error)
        );

        // 响应拦截器
        this.axiosInstance.interceptors.response.use(
            (response) => {
                // 统一处理响应数据
                // 例如：只返回data字段
                return response;
            },
            (error) => {
                // 统一处理错误
                // 例如：弹窗、日志、重定向等
                // if (error.response && error.response.status === 401) { ... }
                return Promise.reject(error);
            }
        );
    }

    async get(url, params) {
        const res = await this.axiosInstance.get(url, { params });
        return res.data;
    }

    async post(url, data) {
        const res = await this.axiosInstance.post(url, data);
        return res.data;
    }

    async put(url, data) {
        const res = await this.axiosInstance.put(url, data);
        return res.data;
    }

    async delete(url, data) {
        const res = await this.axiosInstance.delete(url, { data });
        return res.data;
    }
}