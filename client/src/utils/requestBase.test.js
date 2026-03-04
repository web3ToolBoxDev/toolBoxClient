const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
    }
};

jest.mock('axios', () => ({
    create: jest.fn(() => mockAxiosInstance)
}));

const axios = require('axios');
const { RequestBase } = require('./requestBase');

describe('RequestBase', () => {
    let rb;

    beforeEach(() => {
        jest.clearAllMocks();
        // Re-setup create to return our mockAxiosInstance after clearAllMocks
        axios.create.mockReturnValue(mockAxiosInstance);
        rb = new RequestBase('http://localhost:3000');
    });

    it('creates axios instance with baseURL', () => {
        expect(axios.create).toHaveBeenCalledWith({ baseURL: 'http://localhost:3000' });
    });

    it('registers request and response interceptors', () => {
        expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
        expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });

    it('request interceptor passes through config', () => {
        const requestHandler = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
        const config = { headers: {} };
        expect(requestHandler(config)).toBe(config);
    });

    it('request interceptor error handler rejects', async () => {
        const errorHandler = mockAxiosInstance.interceptors.request.use.mock.calls[0][1];
        await expect(errorHandler(new Error('fail'))).rejects.toThrow('fail');
    });

    it('response interceptor passes through response', () => {
        const responseHandler = mockAxiosInstance.interceptors.response.use.mock.calls[0][0];
        const response = { data: 'ok' };
        expect(responseHandler(response)).toBe(response);
    });

    it('response interceptor error handler rejects', async () => {
        const errorHandler = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];
        await expect(errorHandler(new Error('fail'))).rejects.toThrow('fail');
    });

    it('get returns response data', async () => {
        mockAxiosInstance.get.mockResolvedValue({ data: { ok: true } });
        const result = await rb.get('/test', { q: '1' });
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', { params: { q: '1' } });
        expect(result).toEqual({ ok: true });
    });

    it('post returns response data', async () => {
        mockAxiosInstance.post.mockResolvedValue({ data: { created: true } });
        const result = await rb.post('/items', { name: 'foo' });
        expect(result).toEqual({ created: true });
    });

    it('put returns response data', async () => {
        mockAxiosInstance.put.mockResolvedValue({ data: { updated: true } });
        const result = await rb.put('/items/1', { name: 'bar' });
        expect(result).toEqual({ updated: true });
    });

    it('delete returns response data', async () => {
        mockAxiosInstance.delete.mockResolvedValue({ data: { deleted: true } });
        const result = await rb.delete('/items/1', { id: 1 });
        expect(result).toEqual({ deleted: true });
    });
});
