import { SegmentedControl, Transfer, TransferOption } from "@dhis2/ui";
import { ConfirmationDialog, useSnackbar } from "@eyeseetea/d2-ui-components";
import _ from "lodash";
import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { Future } from "../../../domain/entities/Future";
import { NamedRef } from "../../../domain/entities/Ref";
import { User } from "../../../domain/entities/User";
import { UpdateStrategy } from "../../../domain/repositories/UserRepository";
import i18n from "../../../locales";
import { useAppContext } from "../../contexts/app-context";
import { ellipsizedList } from "../../utils/list";

export const MultiSelectorDialog: React.FC<MultiSelectorDialogProps> = ({ type, ids, onClose }) => {
    const { compositionRoot } = useAppContext();
    const snackbar = useSnackbar();

    const [users, setUsers] = useState<User[]>([]);
    const [items, setItems] = useState<NamedRef[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [updateStrategy, setUpdateStrategy] = useState<UpdateStrategy>("merge");
    const title = getTitle(type, users);

    const handleSave = useCallback(() => {
        if (users.length === 0) {
            snackbar.error("Unable to save users");
            return;
        }

        const update = items.filter(({ id }) => selected.includes(id));

        compositionRoot.users.updateProp(type, ids, update, updateStrategy).run(
            () => onClose(),
            error => snackbar.error(error)
        );
    }, [type, ids, onClose, snackbar, updateStrategy, items, users, selected, compositionRoot]);

    useEffect(() => {
        return Future.joinObj({
            items: compositionRoot.metadata.list(type).map(({ objects }) => objects),
            users: compositionRoot.users.get(ids),
        }).run(
            ({ items, users }) => {
                const roleIds = users.map(user => user[type].map(({ id }) => id));
                const commonRoles = _.intersection(...roleIds);

                setItems(items);
                setUsers(users);
                setSelected(commonRoles);
                setUpdateStrategy(users.length > 1 ? "merge" : "replace");
            },
            error => snackbar.error(error)
        );
    }, [type, ids, compositionRoot, snackbar]);

    return (
        <ConfirmationDialog
            isOpen={true}
            title={title}
            onCancel={onClose}
            maxWidth={"lg"}
            fullWidth={true}
            onSave={handleSave}
        >
            <Container>
                <Label>{i18n.t("Update strategy: ", { nsSeparator: false })}</Label>
                <SegmentedControl
                    options={[
                        {
                            label: i18n.t("Merge"),
                            value: "merge",
                            disabled: users.length === 1,
                        },
                        {
                            label: i18n.t("Replace"),
                            value: "replace",
                        },
                    ]}
                    selected={updateStrategy}
                    onChange={data => setUpdateStrategy((data.value as UpdateStrategy) ?? "merge")}
                />
            </Container>
            <Transfer
                options={buildTransferOptions(items)}
                selected={selected}
                onChange={({ selected }) => setSelected(selected)}
                filterable={true}
                filterablePicked={true}
                filterPlaceholder={i18n.t("Search")}
                filterPlaceholderPicked={i18n.t("Search")}
                selectedWidth="100%"
                optionsWidth="100%"
                height="400px"
            />
        </ConfirmationDialog>
    );
};

const getTitle = (type: "userRoles" | "userGroups", users: User[]): string => {
    const usernames = ellipsizedList(users.map(user => user.username));

    return type === "userRoles"
        ? i18n.t("Assign roles to {{usernames}}", { usernames })
        : i18n.t("Assign groups to {{usernames}}", { usernames });
};

const buildTransferOptions = (options: NamedRef[]): TransferOption[] => {
    return options.map(({ id, name }) => ({ value: id, label: name }));
};

const Container = styled.div`
    display: flex;
    justify-content: right;
    margin-bottom: 16px;
    align-items: center;
`;

const Label = styled.span`
    margin-right: 16px;
`;

export interface MultiSelectorDialogProps {
    // TODO: Add organisation units
    type: "userRoles" | "userGroups";
    ids: string[];
    onClose: () => void;
}
