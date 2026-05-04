export function initUpdateForm(container) {
    const recipeId = container.dataset.recipeId;
    const formEl = container.querySelector(".update__recipe__form__el");

    // --- INGREDIENTS ---
    const ingredientList = container.querySelector(".update__ingredient__list");
    const ingredientFormValues = container.querySelector(
        ".update__ingredient__form__values",
    );
    const nameInput = container.querySelector(
        ".update__ingredient__name__input",
    );
    const quantityInput = container.querySelector(
        ".update__ingredient__quantity__input",
    );
    const unitInput = container.querySelector(
        ".update__ingredient__unit__input",
    );
    const addIngredientBtn = container.querySelector(
        ".update__add__ingredient__button",
    );

    let ingredients = [];

    Array.from(
        ingredientList.querySelectorAll(".update__ingredient__list__item"),
    ).forEach((item) => {
        if (item.dataset.name) {
            ingredients.push({
                name: item.dataset.name,
                quantity: item.dataset.quantity,
                unit: item.dataset.unit,
            });
        }
    });

    function syncIngredientHiddenInputs() {
        ingredientFormValues.innerHTML = "";
        ingredients.forEach(({ name, quantity, unit }) => {
            [
                ["ingredient_name", name],
                ["ingredient_quantity", quantity],
                ["ingredient_unit", unit],
            ].forEach(([fieldName, val]) => {
                const input = document.createElement("input");
                input.type = "hidden";
                input.name = fieldName;
                input.value = val;
                ingredientFormValues.appendChild(input);
            });
        });
    }

    function renderIngredients() {
        ingredientList.innerHTML = "";
        if (ingredients.length === 0) {
            const li = document.createElement("li");
            li.textContent = "No ingredients added yet";
            li.classList.add("no__items__ingredient");
            ingredientList.appendChild(li);
        } else {
            ingredients.forEach(({ name, quantity, unit }, index) => {
                const li = document.createElement("li");
                li.classList.add("ingredient__list__item");

                const label = document.createElement("span");
                label.classList.add("ingredient__list__label");
                label.textContent = `${name} — ${quantity} ${unit}`;

                const editBtn = document.createElement("button");
                editBtn.type = "button";
                editBtn.textContent = "Edit";
                editBtn.classList.add("ingredient__edit__button");
                editBtn.addEventListener("click", () => {
                    nameInput.value = name;
                    quantityInput.value = quantity;
                    unitInput.value = unit;
                    ingredients.splice(index, 1);
                    renderIngredients();
                    nameInput.focus();
                });

                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.textContent = "Delete";
                deleteBtn.classList.add("ingredient__delete__button");
                deleteBtn.addEventListener("click", () => {
                    ingredients.splice(index, 1);
                    renderIngredients();
                });

                li.append(label, editBtn, deleteBtn);
                ingredientList.appendChild(li);
            });
        }
        syncIngredientHiddenInputs();
    }

    renderIngredients();

    addIngredientBtn.addEventListener("click", () => {
        const name = nameInput.value.trim().toLowerCase();
        const quantity = quantityInput.value.trim();
        const unit = unitInput.value.trim();
        if (!name) return;
        ingredients.push({ name, quantity, unit });
        renderIngredients();
        nameInput.value = "";
        quantityInput.value = "";
        unitInput.value = "";
        nameInput.focus();
    });

    // --- TAGS ---
    const selectedTagList = container.querySelector(
        ".update__selected__tag__list",
    );
    const collectionFormValues = container.querySelector(
        ".update__collection__form__values",
    );
    const collectionInput = container.querySelector(
        ".update__collection__input",
    );
    const addCollectionBtn = container.querySelector(
        ".update__add__collection__button",
    );

    let noTagsAlertItem;
    if (selectedTagList.children.length < 1) {
        noTagsAlertItem = document.createElement("li");
        noTagsAlertItem.classList.add("no__items__tag", "visible");
        noTagsAlertItem.textContent =
            "no collections associated with this recipe yet";
        selectedTagList.appendChild(noTagsAlertItem);
    }

    function removeTagFromList(tagItem) {
        tagItem.remove();
    }

    function removeTagFromHiddenForm(tagValue) {
        collectionFormValues.querySelectorAll("input").forEach((input) => {
            if (input.value === tagValue) input.remove();
        });
    }

    function tagAlreadySelected(value) {
        const existing = Array.from(
            selectedTagList.querySelectorAll(".selected__tag__item__block"),
        ).map((el) => el.dataset.valueTitle);
        return existing.includes(value);
    }

    function addTagToHiddenForm(value) {
        const input = document.createElement("input");
        input.name = "tags[]";
        input.type = "hidden";
        input.value = value;
        collectionFormValues.appendChild(input);
    }

    function showTagToUser(value) {
        const li = document.createElement("li");
        li.classList.add("selected__tag__item");

        const block = document.createElement("div");
        block.classList.add("selected__tag__item__block", "tag__item");
        block.dataset.valueTitle = value;
        block.textContent = value;

        const removeBtn = document.createElement("div");
        removeBtn.classList.add("tag__remove__button");
        removeBtn.innerHTML = "<span>❌</span>";
        removeBtn.addEventListener("click", () => {
            removeTagFromList(li);
            removeTagFromHiddenForm(value);
        });

        block.appendChild(removeBtn);
        li.appendChild(block);
        selectedTagList.appendChild(li);
        noTagsAlertItem?.classList.remove("visible");
    }

    function processNewTag(value) {
        if (!value || tagAlreadySelected(value)) return;
        addTagToHiddenForm(value);
        showTagToUser(value);
    }

    addCollectionBtn.addEventListener("click", () => {
        processNewTag(collectionInput.value.trim());
        collectionInput.value = "";
    });

    container
        .querySelectorAll(
            ".update__existing__collection__list .existing__collection__item__button",
        )
        .forEach((btn) => {
            btn.addEventListener("click", () =>
                processNewTag(btn.dataset.tagTitle),
            );
        });

    // seed hidden form with tags already rendered server-side
    selectedTagList.querySelectorAll(".selected__tag__item").forEach((item) => {
        const block = item.querySelector(".selected__tag__item__block");
        if (!block) return;
        addTagToHiddenForm(block.dataset.valueTitle);
        item.querySelector(".tag__remove__button")?.addEventListener(
            "click",
            () => {
                removeTagFromList(item);
                removeTagFromHiddenForm(block.dataset.valueTitle);
            },
        );
    });

    // --- DIRTY STATE ---
    const saveBar = container.querySelector(".update__recipe__save__bar");

    formEl.addEventListener("input", () => saveBar.classList.add("is-dirty"));
    formEl.addEventListener("change", () => saveBar.classList.add("is-dirty"));

    // --- TOGGLE ---
    const toggleBtn = container.querySelector(".toggle__update__form__button");
    const formPanel = container.querySelector(".update__recipe__form");

    toggleBtn.addEventListener("click", () => {
        const isHidden = formPanel.hidden;
        if (!isHidden && saveBar.classList.contains("is-dirty")) {
            if (!confirm("You have unsaved changes. Close without saving?"))
                return;
        }
        formPanel.hidden = !isHidden;
        toggleBtn.textContent = isHidden ? "Close editor" : "Edit recipe";
    });

    // --- FETCH SUBMIT ---
    formEl.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = formEl.querySelector(".update__recipe__submit");
        submitBtn.textContent = "Saving...";
        submitBtn.disabled = true;

        try {
            const response = await fetch(`/recipes/${recipeId}/update`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                },
                body: new URLSearchParams(new FormData(formEl)).toString(),
            });
            const data = await response.json();

            if (response.ok) {
                const recipeCard = container.closest(".recipe__item");

                if (data.title) {
                    const titleEl = recipeCard.querySelector(
                        ".recipe__item__title",
                    );
                    if (titleEl) titleEl.textContent = data.title;
                    const popoutTitleEl = recipeCard.querySelector(
                        ".ingredients__popout__title",
                    );
                    if (popoutTitleEl) popoutTitleEl.textContent = data.title;
                    recipeCard.dataset.title = data.title;
                }
                if (data.description !== undefined) {
                    const descEl = recipeCard.querySelector(
                        ".recipe__item__description",
                    );
                    if (descEl) descEl.textContent = data.description;
                }

                // rebuild ingredient toggle buttons so updated list is immediately usable
                if (data.ingredients) {
                    const popoutList = recipeCard.querySelector(
                        ".ingredients__popout__list",
                    );
                    popoutList.innerHTML = "";
                    data.ingredients.forEach((ingredient) => {
                        const li = document.createElement("li");
                        li.classList.add("ingredients__popout__item");
                        const btn = document.createElement("button");
                        btn.type = "button";
                        btn.classList.add("ingredient__button");
                        btn.title = "click to add ingredient to shopping list";
                        btn.dataset.ingredientName = ingredient.name;
                        btn.textContent = ingredient.name;
                        btn.addEventListener("click", function () {
                            const hiddenContainer = btn
                                .closest(".ingredients__popout")
                                .querySelector(
                                    ".hidden__ingredients__inputs__container",
                                );
                            if (btn.classList.contains("selected")) {
                                Array.from(
                                    hiddenContainer.getElementsByTagName(
                                        "input",
                                    ),
                                ).forEach((input) => {
                                    if (
                                        input.value ===
                                        btn.dataset.ingredientName
                                    )
                                        input.remove();
                                });
                                btn.classList.remove("selected");
                            } else {
                                const input = document.createElement("input");
                                input.name = "ingredients[]";
                                input.type = "hidden";
                                input.value = btn.dataset.ingredientName;
                                hiddenContainer.appendChild(input);
                                btn.classList.add("selected");
                            }
                        });
                        li.appendChild(btn);
                        popoutList.appendChild(li);
                    });
                }

                // rebuild tag pills on the recipe card
                if (data.tags) {
                    const tagList = recipeCard.querySelector(
                        ".single__recipe__collection__list",
                    );
                    tagList.innerHTML = "";
                    data.tags.forEach((tag) => {
                        const li = document.createElement("li");
                        li.classList.add(
                            "single__recipe__collection__item",
                            "tag__item",
                        );
                        li.dataset.tagName = tag.tag_name;
                        li.textContent = tag.tag_name;
                        tagList.appendChild(li);
                    });
                }

                saveBar.classList.remove("is-dirty");
                formPanel.hidden = true;
                toggleBtn.textContent = "Edit recipe";
            }
        } catch (err) {
            console.error("Update failed", err);
        } finally {
            submitBtn.textContent = "Save changes";
            submitBtn.disabled = false;
        }
    });

    // --- FETCH DELETE ---
    const deleteBtn = container.querySelector(
        ".update__delete__recipe__button",
    );
    deleteBtn?.addEventListener("click", async () => {
        const title =
            container.querySelector(".update__recipe__title")?.value ||
            "this recipe";
        if (!confirm(`Are you sure you want to delete ${title}?`)) return;
        const response = await fetch(`/recipes/${recipeId}`, {
            method: "DELETE",
            headers: { Accept: "application/json" },
        });
        if (response.ok) {
            container.closest(".recipe__item").remove();
        }
    });
}

export function initAllUpdateForms() {
    document
        .querySelectorAll(".update__recipe__form__container")
        .forEach(initUpdateForm);
}
