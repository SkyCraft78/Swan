/* eslint-disable no-param-reassign */

/**
 * @description Fonction pour calculer la distance jaro-winkler entre 2 strings
 * @param {String} s1 Premier string
 * @param {String} s2 Second string
 * @returns {Number} Nombre entre 0 et 1, qui est la distance JK entre les 2 textes
 */
export default function jwDistance(s1, s2) {
  s1 = s1.toUpperCase();
  s2 = s2.toUpperCase();
  if (s1.length === 0 || s2.length === 0) return 0; // Si une des 2 strings est vide
  if (s1 === s2) return 1; // Si les 2 strings sont égaux

  // Compter les matchs
  let m = 0;
  const range = (Math.floor(Math.max(s1.length, s2.length) / 2)) - 1;
  const s1Matches = new Array(s1.length);
  const s2Matches = new Array(s2.length);

  for (let i = 0; i < s1.length; i++) {
    const low = i >= range ? i - range : 0;
    const high = i + range <= (s2.length - 1) ? i + range : s2.length - 1;
    for (let j = low; j <= high; j++) {
      if (s1Matches[i] !== true && s2Matches[j] !== true && s1[i] === s2[j]) {
        ++m;
        s1Matches[i] = true;
        s2Matches[j] = true;
        break;
      }
    }
  }

  if (m === 0) return 0; // Si aucun match n'est trouvé

  // Compter les transpositions
  let k = 0;
  let numTrans = 0;

  for (let i = 0; i < s1.length; i++) {
    if (s1Matches[i] === true) {
      let j;
      for (j = k; j < s2.length; j++) {
        if (s2Matches[j] === true) {
          k = j + 1;
          break;
        }
      }

      if (s1[i] !== s2[j]) ++numTrans;
    }
  }

  let weight = (m / s1.length + m / s2.length + (m - (numTrans / 2)) / m) / 3;
  let l = 0;

  if (weight > 0.7) {
    while (s1[l] === s2[l] && l < 4) ++l;
    weight += l * 0.1 * (1 - weight);
  }

  return weight;
}
