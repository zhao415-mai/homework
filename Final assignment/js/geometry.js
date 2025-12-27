/**
 * 几何体创建函数
 */

// 创建球体几何体
function createSphereGeometry(radius, segments) {
    const vertices = [];
    const normals = [];
    const texCoords = [];
    const indices = [];

    for (let lat = 0; lat <= segments; lat++) {
        const theta = lat * Math.PI / segments;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lon = 0; lon <= segments; lon++) {
            const phi = lon * 2 * Math.PI / segments;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            // 顶点坐标
            const x = radius * sinTheta * cosPhi;
            const y = radius * cosTheta;
            const z = radius * sinTheta * sinPhi;
            
            // 法向量（球体的法向量等于顶点坐标归一化）
            const nx = sinTheta * cosPhi;
            const ny = cosTheta;
            const nz = sinTheta * sinPhi;
            
            // 纹理坐标
            const u = 1 - (lon / segments);
            const v = 1 - (lat / segments);

            vertices.push(x, y, z);
            normals.push(nx, ny, nz);
            texCoords.push(u, v);
        }
    }

    // 创建索引
    for (let lat = 0; lat < segments; lat++) {
        for (let lon = 0; lon < segments; lon++) {
            const first = (lat * (segments + 1)) + lon;
            const second = first + segments + 1;
            
            indices.push(first + 1, second + 1, second);
            indices.push(first + 1, second, first);
        }
    }

    return {
        vertices: new Float32Array(vertices),
        normals: new Float32Array(normals),
        texCoords: new Float32Array(texCoords),
        indices: new Uint16Array(indices)
    };
}

// 创建平面几何体
function createPlaneGeometry(width, height) {
    const w = width / 2;
    const h = height / 2;

    // 顶点坐标
    const vertices = [
        -w, 0, -h,
         w, 0, -h,
         w, 0,  h,
        -w, 0,  h
    ];

    // 法向量
    const normals = [
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0
    ];

    // 纹理坐标
    const texCoords = [
        0, 0,
        1, 0,
        1, 1,
        0, 1
    ];

    // 索引
    const indices = [
        0, 1, 2,
        0, 2, 3
    ];

    return {
        vertices: new Float32Array(vertices),
        normals: new Float32Array(normals),
        texCoords: new Float32Array(texCoords),
        indices: new Uint16Array(indices)
    };
}