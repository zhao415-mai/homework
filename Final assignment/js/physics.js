/**
 * 物理系统和交互控制
 */

// 初始化交互
function initInteraction() {
    // 键盘事件
    document.addEventListener('keydown', (e) => {
        switch(e.key.toLowerCase()) {
            case 'w': scene.keys.w = true; break;
            case 'a': scene.keys.a = true; break;
            case 's': scene.keys.s = true; break;
            case 'd': scene.keys.d = true; break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch(e.key.toLowerCase()) {
            case 'w': scene.keys.w = false; break;
            case 'a': scene.keys.a = false; break;
            case 's': scene.keys.s = false; break;
            case 'd': scene.keys.d = false; break;
        }
    });

    // 鼠标滚轮缩放
    document.addEventListener('wheel', (e) => {
        e.preventDefault();
        const distance = Math.sqrt(
            Math.pow(scene.camera.position[0] - scene.camera.target[0], 2) +
            Math.pow(scene.camera.position[2] - scene.camera.target[2], 2)
        );
        const newDistance = distance - e.deltaY * 0.01;
        const clampedDistance = Math.max(5, Math.min(20, newDistance));
        
        const direction = normalizeVector([
            scene.camera.target[0] - scene.camera.position[0],
            0,
            scene.camera.target[2] - scene.camera.position[2]
        ]);
        
        scene.camera.position[0] = scene.camera.target[0] - direction[0] * clampedDistance;
        scene.camera.position[2] = scene.camera.target[2] - direction[2] * clampedDistance;
        scene.viewMatrix = lookAtMatrix(scene.camera.position, scene.camera.target, [0,1,0]);
    });
}

// 更新物理状态
function updatePhysics() {
    const player = scene.spheres.find(s => s.isPlayer);
    if (!player) return;

    // 玩家控制
    const moveSpeed = 0.15;
    let dx = 0, dz = 0;
    if (scene.keys.w) dz += moveSpeed;
    if (scene.keys.s) dz -= moveSpeed;
    if (scene.keys.a) dx -= moveSpeed;
    if (scene.keys.d) dx += moveSpeed;

    // 归一化移动向量
    const moveLen = Math.sqrt(dx*dx + dz*dz);
    if (moveLen > 0) {
        dx /= moveLen;
        dz /= moveLen;
        player.velocity[0] = dx * moveSpeed;
        player.velocity[2] = dz * moveSpeed;
    } else {
        // 减速
        player.velocity[0] *= 0.9;
        player.velocity[2] *= 0.9;
    }

    // 更新所有球体位置
    scene.spheres.forEach(sphere => {
        sphere.position[0] += sphere.velocity[0];
        sphere.position[2] += sphere.velocity[2];
    });

    // 球体之间的碰撞
    for (let i = 0; i < scene.spheres.length; i++) {
        for (let j = i + 1; j < scene.spheres.length; j++) {
            resolveSphereCollision(scene.spheres[i], scene.spheres[j]);
        }
    }

    // 球体与墙壁的碰撞
    scene.spheres.forEach(sphere => {
        scene.walls.forEach(wall => {
            resolveWallCollision(sphere, wall);
        });
    });

    // 相机固定，不再跟随玩家（主视角为俯视45°）
}

// 球体碰撞处理
function resolveSphereCollision(s1, s2) {
    const dx = s2.position[0] - s1.position[0];
    const dz = s2.position[2] - s1.position[2];
    const distance = Math.sqrt(dx*dx + dz*dz);
    const minDistance = s1.radius + s2.radius;

    if (distance < minDistance) {
        // 分离球体
        const overlap = minDistance - distance;
        const direction = normalizeVector([dx, 0, dz]);
        s1.position[0] -= direction[0] * overlap * 0.5;
        s1.position[2] -= direction[2] * overlap * 0.5;
        s2.position[0] += direction[0] * overlap * 0.5;
        s2.position[2] += direction[2] * overlap * 0.5;

        // 计算碰撞后的速度（动量守恒）
        const m1 = s1.radius * s1.radius; // 用半径平方模拟质量
        const m2 = s2.radius * s2.radius;
        const totalMass = m1 + m2;

        const v1x = s1.velocity[0];
        const v1z = s1.velocity[2];
        const v2x = s2.velocity[0];
        const v2z = s2.velocity[2];

        const velDiff = [v2x - v1x, 0, v2z - v1z];
        const velAlongNormal = dotProduct(velDiff, direction);

        if (velAlongNormal > 0) return;

        const restitution = 0.8; // 恢复系数
        const j = -(1 + restitution) * velAlongNormal;
        const jDiv = 1/m1 + 1/m2;
        const impulse = j / jDiv;

        const impulseVec = [direction[0] * impulse, 0, direction[2] * impulse];

        s1.velocity[0] -= (impulseVec[0] / m1);
        s1.velocity[2] -= (impulseVec[2] / m1);
        s2.velocity[0] += (impulseVec[0] / m2);
        s2.velocity[2] += (impulseVec[2] / m2);
    }
}

// 球体与墙壁碰撞处理
function resolveWallCollision(sphere, wall) {
    const wallPos = wall.position;
    const wallNormal = wall.normal;
    const spherePos = sphere.position;

    // 计算球体到墙壁的距离
    const d = -dotProduct(wallNormal, wallPos);
    const distance = dotProduct(wallNormal, spherePos) + d;

    // 检测碰撞
    if (Math.abs(distance) < sphere.radius) {
        // 分离球体
        const overlap = sphere.radius - Math.abs(distance);
        const direction = distance > 0 ? 1 : -1;
        sphere.position[0] -= wallNormal[0] * overlap * direction;
        sphere.position[2] -= wallNormal[2] * overlap * direction;

        // 计算反弹
        const restitution = 0.8;
        const velAlongNormal = dotProduct(sphere.velocity, wallNormal);
        sphere.velocity[0] -= (1 + restitution) * velAlongNormal * wallNormal[0];
        sphere.velocity[2] -= (1 + restitution) * velAlongNormal * wallNormal[2];
    }
}