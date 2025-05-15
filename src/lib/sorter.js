function getSorter(attr) {
    let caster = (d) => d;

    if (attr == "id") {
        caster = Number.parseInt;
    }

    return function comparator(a, b) {
        if (caster(a.dataset[attr]) < caster(b.dataset[attr])) return -1;
        if (caster(a.dataset[attr]) > caster(b.dataset[attr])) return 1;
        return 0;
    };
}

document.getElementById("sort").onchange = (event) => {
    var printDivs = Array.from(document.querySelectorAll(`.print`));
    let sorted = printDivs.sort(getSorter(event.target.value));
    sorted.forEach((e) => document.querySelector("#prints").appendChild(e));
};