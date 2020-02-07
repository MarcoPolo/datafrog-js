const { Relation, Variable, gallop, joinHelper } = require("./index.js");

const sortByIdentity = a => a;

describe("Relation", () => {
  test("Create should sort + dedup", () => {
    const relation = new Relation(
      [1, 5, 5, 0, 1, 2, 3, 10, 19, 20],
      sortByIdentity
    );
    const expectedResult = [0, 1, 2, 3, 5, 10, 19, 20];
    expect(relation.elements).toEqual(expectedResult);
  });

  test("Merging should sort + dedup", () => {
    const relationA = new Relation([1, 5, 5, 0, 1, 2, 3], sortByIdentity);
    const relationB = new Relation([5, 2, 2, 6, 0, 9, 2], sortByIdentity);
    const expectedResult = [0, 1, 2, 3, 5, 6, 9];
    expect(relationA.merge(relationB).elements).toEqual(expectedResult);
  });

  test("Should dedup tuples", () => {
    let relation = new Relation([[1, "bob"]]);
    expect(relation.elements).toEqual([[1, "bob"]]);
    relation = relation.merge(new Relation([[1, "bob"]]));
    expect(relation.elements).toEqual([[1, "bob"]]);
  });
});

describe("gallop", () => {
  test("Should find the first index for an empty array", () => {
    const array = [];
    expect(gallop(array, n => false)).toEqual(0);
  });
  test("Should find the first index", () => {
    const array = [0, 1, 2, 3, 4, 5];
    expect(gallop(array, n => false)).toEqual(0);
  });

  test("Should return an index out of bounds", () => {
    const array = [0, 1, 2, 3, 4, 5];
    expect(gallop(array, n => true)).toEqual(array.length);
  });

  test("Should find the first index > 3", () => {
    const array = [0, 1, 2, 3, 4, 5];
    expect(gallop(array, n => n < 3)).toEqual(3);
  });

  test("Should find the first index > 3", () => {
    const array = [0, 1, 2, 3, 3, 3, 4, 5];
    expect(gallop(array, n => n < 3)).toEqual(3);
  });
});

describe("joinHelper", () => {
  test("Should find a simple join", () => {
    const relationA = new Relation([[1, "hi"]]);
    const relationB = new Relation([[1, "bob"]]);
    const output = [];

    joinHelper(relationA, relationB, (k, valueA, valueB) =>
      output.push([k, valueA, valueB])
    );

    const expectedResult = [[1, "hi", "bob"]];

    expect(output).toEqual(expectedResult);
  });
  test("Should find joins", () => {
    const relationA = new Relation([
      [1, "hi"],
      [2, "hello"],
      [2, "goodbye"],
      [1, "greetings"]
    ]);
    const relationB = new Relation([
      [1, "bob"],
      [2, "world"],
      [3, "sarah"]
    ]);
    const output = [];

    joinHelper(relationA, relationB, (k, valueA, valueB) =>
      output.push([k, valueA, valueB])
    );

    const expectedResult = [
      [1, "hi", "bob"],
      [1, "greetings", "bob"],
      [2, "hello", "world"],
      [2, "goodbye", "world"]
    ];

    expect(output).toEqual(expectedResult);
  });
});

describe("Variable", () => {
  test("Should move inner relations along", () => {
    const relation = new Relation([
      [1, "bob"],
      [2, "world"],
      [3, "sarah"]
    ]);

    const variable = new Variable();
    variable.insert(relation);

    expect(variable.stable).toEqual([]);
    expect(variable.recent.elements).toEqual([]);
    expect(variable.toAdd).toEqual([relation]);

    // query changed?
    let hasChanged = variable.changed();
    expect(hasChanged).toEqual(true);
    expect(variable.stable).toEqual([]);
    expect(variable.recent).toEqual(relation);
    expect(variable.toAdd).toEqual([]);

    hasChanged = variable.changed();
    expect(hasChanged).toEqual(false);
    expect(variable.stable).toEqual([relation]);
    expect(variable.recent.elements).toEqual([]);
    expect(variable.toAdd).toEqual([]);
  });

  test("Should remove entries already in stable from toAdd", () => {
    const relation = new Relation([[1, "bob"]]);

    const variable = new Variable();
    variable.insert(relation);
    while (variable.changed()) {}

    expect(variable.stable[0]).toEqual(relation);
    expect(variable.recent.elements).toEqual([]);
    expect(variable.toAdd).toEqual([]);

    variable.insert(new Relation([[1, "bob"]]));
    while (variable.changed()) {}

    expect(variable.stable[0]).toEqual(relation);
    expect(variable.recent.elements).toEqual([]);
    expect(variable.toAdd).toEqual([]);
  });

  test("Join from another variable", () => {
    const relationA = new Relation([
      [1, "hi"],
      [2, "hello"],
      [2, "goodbye"],
      [1, "greetings"]
    ]);
    const relationB = new Relation([
      [1, "bob"],
      [2, "world"],
      [3, "sarah"]
    ]);

    const variableA = new Variable();
    const variableB = new Variable();

    variableA.insert(relationA);
    variableB.insert(relationB);
    while (variableB.changed()) {}

    let max = 0;
    while (variableA.changed() && max++ < 100) {
      variableA.fromJoin(variableB, (k, vA, vB) => {
        return [k, vB];
      });
    }

    expect(variableA.recent.elements).toEqual([]);
    expect(variableA.toAdd).toEqual([]);

    expect(variableA.stable.length).toEqual(1);
    expect(variableA.stable[0].elements).toEqual([
      [1, "hi"],
      [1, "greetings"],
      [1, "bob"],
      [2, "hello"],
      [2, "goodbye"],
      [2, "world"]
    ]);
  });
});
