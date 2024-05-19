precision highp float;

varying vec2 uv;
uniform vec2 inverseResolution;
uniform sampler2D src, position, densityVelocity;
uniform float dt;
uniform float turn;
uniform float uRand, uRandomness;
uniform float uCohesion, uSeparation, uAlignment, uVelocityEnforcement, uLeading;

float random(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 derivative(vec4 state) {
  vec2 xy1 = state.xy + uLeading * dt * state.zw;

        // Sample the blurred density and velocity
  vec3 densityVelocitym = texture2D(densityVelocity, xy1).xzw;
  xy1 = state.xy + dt * 2.0 * uLeading * densityVelocitym.yz / densityVelocitym.x;

  vec4 densityVelocity0 = texture2D(densityVelocity, state.xy);
  float density0 = densityVelocity0.x;
  vec2 avgVelocity = densityVelocity0.zw / max(density0, 1.0);

        // Sample neighboring texels to compute the density gradient
  float r = 1.0;
  float densityE = texture2D(densityVelocity, state.xy + vec2(inverseResolution.x, 0.0)).x;
  float densityW = texture2D(densityVelocity, state.xy + vec2(-inverseResolution.x, 0.0)).x;
  float densityN = texture2D(densityVelocity, state.xy + vec2(0.0, inverseResolution.y)).x;
  float densityS = texture2D(densityVelocity, state.xy + vec2(0.0, -inverseResolution.y)).x;
  vec2 densityGradient = vec2(densityE - densityW, densityN - densityS) / inverseResolution;

  vec4 avgPositionValues = texture2D(position, xy1);
  float density1 = texture2D(densityVelocity, xy1).x;

        // Divide the sum of velocities by the sum of masses to compute a mass-weighted
        // local average position
  vec2 avgPosition = vec2(state.x < 0.5 ? avgPositionValues.x : avgPositionValues.z, state.y < 0.5 ? avgPositionValues.y : avgPositionValues.w) / max(density1, 1e-8);

        // The magic numbers!
  float repulsion = (0.2 * 2.0) * uSeparation;
  float follow = (2500.0 * 2.0) * uAlignment;
  float cohesion = (850000.0 * 2.0) * uCohesion;
  float velocityEnforcement = (190.0 * 2.0) * uVelocityEnforcement;
  float vmag = length(state.zw);

  vec2 turn = 50.0 * normalize(densityGradient.yx) * pow(density0, 1.0) * vec2(-1.0, 1.0);
  vec2 randLoc = gl_FragCoord.xy + uRand * 100.0;
  vec2 rand = vec2(random(randLoc), random(randLoc + 0.5)) - 0.5;

  return vec4(state.zw, -densityGradient * repulsion + (avgVelocity - state.zw) * follow + (avgPosition - state.xy) * cohesion / max(0.01, uLeading) + state.zw * (5.0 - vmag) * velocityEnforcement + 20000.0 * rand * uRandomness
          //+ turn
  - 1000.0 * length(state.xy - 0.5) * (state.xy - 0.5));
}

void main() {
  vec4 yn = texture2D(src, uv);
  gl_FragColor = yn + dt * derivative(yn);

  float velocity = length(gl_FragColor.zw);
  const float maxVelocity = 10.0;
  if(velocity > maxVelocity)
    gl_FragColor.zw *= maxVelocity / velocity;

  gl_FragColor.xy = fract(gl_FragColor.xy);//, vec2(0), vec2(1));
}
