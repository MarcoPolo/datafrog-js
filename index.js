// An implementation of https://github.com/rust-lang/datafrog
const _ = require("lodash");

const sortByFirstAsKey = ([k]) => k;

// A sorted list of distinct tuples.
class Relation {
  constructor(fromArray, sortByFn = sortByFirstAsKey) {
    this.sortByFn = sortByFn;
    this.elements = _.uniqWith(_.sortBy(fromArray, sortByFn), _.isEqual);
  }

  merge(otherRelation) {
    if (otherRelation.sortByFn !== this.sortByFn) {
      throw new Error(
        "Merging a relation that doesn't have the same sortByFn!"
      );
    }

    return new Relation(
      this.elements.concat(otherRelation.elements),
      this.sortByFn
    );
  }

  get length() {
    return this.elements.length;
  }
}

class Variable {
  constructor() {
    // A list of already processed tuples.
    this.stable = [];
    // A list of recently added but unprocessed tuples.
    this.recent = new Relation([]);
    // A list of tuples yet to be introduced.
    this.toAdd = [];
  }

  insert(relation) {
    this.toAdd.push(relation);
  }

  fromJoin(otherVariable, logicFn) {
    joinInto(this, otherVariable, this, logicFn);
  }

  changed() {
    // 1. Merge this.recent into this.stable.
    if (this.recent.elements.length > 0) {
      let recent = this.recent;
      this.recent = new Relation([], recent.sortByFn);

      // TODO visualize this!
      // Merge smaller stable relations into our recent one. This keeps bigger
      // relations to the left, and smaller relations to the right. merging them
      // over time so not to keep a bunch of small relations.
      while (
        this.stable[this.stable.length - 1] &&
        this.stable[this.stable.length - 1].length <= 2 * recent.elements.length
      ) {
        const last = this.stable.pop();
        recent = last.merge(recent);
      }

      this.stable.push(recent);
    }

    // 2. Move this.to_add into this.recent.
    if (this.toAdd.length > 0) {
      // 2a. Merge all newly added relations.
      let toAdd = this.toAdd.pop();
      while (this.toAdd.length > 0) {
        toAdd = toAdd.merge(this.toAdd.pop());
      }

      // 2b. Restrict `to_add` to tuples not in `this.stable`.
      for (let index = 0; index < this.stable.length; index++) {
        const stableRelation = this.stable[index];
        toAdd.elements = toAdd.elements.filter(elem => {
          let searchIdx = gallop(stableRelation.elements, ([k]) => k < elem[0]);

          while (
            searchIdx < stableRelation.elements.length &&
            stableRelation.elements[searchIdx][0] === elem[0]
          ) {
            if (_.isEqual(stableRelation.elements[searchIdx], elem)) {
              return false;
            }
            searchIdx++;
          }
          return true;
        });
      }
      this.recent = toAdd;
    }

    // Return true iff recent is non-empty.
    return !!this.recent.length;
  }
}

// Finds the first index for which predicate is false. Returns an index of array.length if it will never be true
// predFn takes the form of (x: number) => boolean
function gallop(array, predFn, startIdx = 0) {
  if (array.length - startIdx <= 0 || !predFn(array[startIdx])) {
    return 0;
  }

  let step = 1;

  // Step up until we've seen a false result from predFn
  while (startIdx + step < array.length && predFn(array[startIdx + step])) {
    startIdx += step;
    step = step << 1;
  }

  // Now step down until we get a false result
  step = step >> 1;
  while (step > 0) {
    if (startIdx + step < array.length && predFn(array[startIdx + step])) {
      startIdx += step;
    }
    step = step >> 1;
  }

  return startIdx + 1;
}

// logicFn takes the form of (key, val1, val2)
// relations should be a sorted set of (K, V) tuples, sorted by key.
// we join on the first item in the tuple.
function joinHelper(relationA, relationB, logicFn) {
  // Keep track of the indices into the relation's elements
  let idxA = 0;
  let idxB = 0;
  let max = 0;
  while (
    max < 100 &&
    idxA < relationA.elements.length &&
    idxB < relationB.elements.length
  ) {
    max++;
    let elemAKey = relationA.elements[idxA][0];
    let elemBKey = relationB.elements[idxB][0];

    if (elemAKey < elemBKey) {
      // We have to move idxA up to catch to elemB
      idxA = gallop(relationA.elements, ([k]) => k < elemBKey, idxA);
    } else if (elemBKey < elemAKey) {
      // We have to move idxB up to catch to elemA
      idxB = gallop(relationB.elements, ([k]) => k < elemAKey, idxB);
    } else {
      // They're equal. We have our join

      // Figure out the count of matches in each relation
      const matchingCountA = _.takeWhile(
        relationA.elements.slice(idxA),
        ([k]) => k === elemAKey
      ).length;
      const matchingCountB = _.takeWhile(
        relationB.elements.slice(idxB),
        ([k]) => k === elemAKey
      ).length;

      // Call logicFn on the cross product
      for (let i = 0; i < matchingCountA; i++) {
        for (let j = 0; j < matchingCountB; j++) {
          logicFn(
            elemAKey,
            relationA.elements[idxA + i][1],
            relationB.elements[idxB + j][1]
          );
        }
      }

      idxA += matchingCountA;
      idxB += matchingCountB;
    }
  }
}

// logicFn is of the type: (Key, ValA, ValB) => Result
// where Result is the type of data that will live in outputVariable.
// To join these two variables we have to join 3 things.
// inputVariableA.recent – inputVariableB.stable
// inputVariableA.stable – inputVariableB.recent
// inputVariableA.recent – inputVariableB.recent
function joinInto(inputVariableA, inputVariableB, outputVariable, logicFn) {
  const results = [];

  // inputVariableA.recent – inputVariableB.stable
  for (let index = 0; index < inputVariableB.stable.length; index++) {
    const stableRelation = inputVariableB.stable[index];
    joinHelper(inputVariableA.recent, stableRelation, (k, vA, vB) =>
      results.push(logicFn(k, vA, vB))
    );
  }
  // inputVariableA.stable – inputVariableB.recent
  for (let index = 0; index < inputVariableA.stable.length; index++) {
    const stableRelation = inputVariableA.stable[index];
    joinHelper(stableRelation, inputVariableB.recent, (k, vA, vB) =>
      results.push(logicFn(k, vA, vB))
    );
  }

  // inputVariableA.recent – inputVariableB.recent
  joinHelper(inputVariableA.recent, inputVariableB.recent, (k, vA, vB) =>
    results.push(logicFn(k, vA, vB))
  );

  outputVariable.insert(new Relation(results));
}

module.exports = { Relation, Variable, gallop, joinHelper };
